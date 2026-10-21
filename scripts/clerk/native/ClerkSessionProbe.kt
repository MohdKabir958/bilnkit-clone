package in_grozo.clerkprobe

import android.content.Context
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.GetTokenOptions
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * Compile-only feasibility experiment, NOT an installed authentication implementation.
 * The probe runner adds this source to an existing app temporarily. No Activity registers it.
 * This intentionally has no sign-in UI, callback handler, business-role mapping or persistence.
 * Those flows must pass real provider/device checks before production integration.
 */
internal class ClerkSessionProbe(
    private val context: Context,
    messenger: BinaryMessenger,
    private val scope: CoroutineScope,
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, "in.grozo/clerk_feasibility")
    private var configuredKey: String? = null

    init { channel.setMethodCallHandler(this) }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        // The host must supply a Main-thread lifecycle scope and cancel it on detachment.
        scope.launch {
            try {
                when (call.method) {
                    "initialize" -> {
                        val key = call.argument<String>("publishableKey") ?: ""
                        require(key.startsWith("pk_test_") || key.startsWith("pk_live_"))
                        // Switching Clerk instances requires a fresh process, never a mixed cache.
                        check(configuredKey == null || configuredKey == key)
                        if (configuredKey == null) {
                            Clerk.initialize(context.applicationContext, key)
                            configuredKey = key
                        }
                        withTimeout(20_000) { Clerk.isInitialized.first { it } }
                        result.success(true)
                    }
                    "session" -> {
                        check(Clerk.isInitialized.value)
                        val session = Clerk.session
                        result.success(session?.let { mapOf("sessionId" to it.id, "userId" to Clerk.user?.id) })
                    }
                    "getToken" -> {
                        check(Clerk.isInitialized.value)
                        if (Clerk.session == null) {
                            result.error("UNAUTHENTICATED", "Sign in required.", null)
                        } else {
                            // The SDK owns refresh and storage. No application-issued JWT or disk cache.
                            when (val response = withTimeout(20_000) {
                                Clerk.auth.getToken(GetTokenOptions(skipCache = call.argument<Boolean>("forceRefresh") == true))
                            }) {
                                is ClerkResult.Success -> result.success(response.value)
                                is ClerkResult.Failure -> result.error("TOKEN_UNAVAILABLE", "Session token unavailable.", null)
                            }
                        }
                    }
                    "signOut" -> {
                        check(Clerk.isInitialized.value)
                        when (val response = withTimeout(20_000) { Clerk.auth.signOut() }) {
                            is ClerkResult.Success -> result.success(true)
                            is ClerkResult.Failure -> result.error("SIGN_OUT_FAILED", "Sign out could not be confirmed.", null)
                        }
                    }
                    else -> result.notImplemented()
                }
            } catch (_: TimeoutCancellationException) {
                result.error("CLERK_TIMEOUT", "Authentication service timed out.", null)
            } catch (error: CancellationException) {
                // Cancellation belongs to the host lifecycle. Never turn it into a signed-out state.
                throw error
            } catch (_: Exception) {
                // Do not send SDK errors, credentials or tokens to logs or across error details.
                result.error("CLERK_UNAVAILABLE", "Authentication service unavailable.", null)
            }
        }
    }

    fun detach() { channel.setMethodCallHandler(null) }
}
