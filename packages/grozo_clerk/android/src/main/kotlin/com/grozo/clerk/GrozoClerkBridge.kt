package com.grozo.clerk

import android.app.Activity
import android.content.Intent
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.GetTokenOptions
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

class GrozoClerkBridge(private val activity: Activity, messenger: BinaryMessenger) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private val scope = CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val methods = MethodChannel(messenger,"in.grozo/clerk")
    private val events = EventChannel(messenger,"in.grozo/clerk/events")
    private var listener: EventChannel.EventSink? = null
    private var collector: Job? = null
    private var pending: MethodChannel.Result? = null
    private val authRequest = 41623
    init { methods.setMethodCallHandler(this); events.setStreamHandler(this) }

    private fun snapshot(): Map<String,Any?> = mapOf(
        "ready" to Clerk.isInitialized.value,
        "signedIn" to (Clerk.isAuthFlowComplete && Clerk.session != null),
        "userId" to Clerk.user?.id, "sessionId" to Clerk.session?.id,
        "name" to listOfNotNull(Clerk.user?.firstName,Clerk.user?.lastName).joinToString(" "),
        "email" to Clerk.user?.primaryEmailAddress?.emailAddress,
    )
    private suspend fun ready() {
        GrozoClerkRuntime.configure(activity)
        check(GrozoClerkRuntime.isConfigured())
        withTimeout(20_000) { Clerk.isInitialized.first { it } }
    }
    private fun collectState() {
        if (!GrozoClerkRuntime.isConfigured() || listener == null) return
        collector?.cancel()
        collector = scope.launch {
            combine(Clerk.isInitialized,Clerk.sessionFlow,Clerk.isAuthFlowCompleteFlow) { _,_,_ -> snapshot() }
                .collect { listener?.success(it) }
        }
    }
    override fun onListen(arguments: Any?, sink: EventChannel.EventSink) { listener=sink; collectState() }
    override fun onCancel(arguments: Any?) { collector?.cancel();collector=null;listener=null }

    override fun onMethodCall(call: MethodCall,result: MethodChannel.Result) {
        scope.launch {
            try {
                if (call.method == "signOut") {
                    var remote = false
                    try { ready(); remote = withTimeout(15_000) { Clerk.auth.signOut() } is ClerkResult.Success }
                    catch (_: TimeoutCancellationException) { /* local removal still required */ }
                    catch (cancel: CancellationException) { throw cancel }
                    catch (_: Exception) { /* no false claim of provider revocation */ }
                    collector?.cancel()
                    GrozoClerkRuntime.clearLocal(activity)
                    collectState()
                    result.success(mapOf("localCleared" to true,"remoteRevoked" to remote))
                    return@launch
                }
                ready(); collectState()
                when(call.method) {
                    "initialize", "session" -> result.success(snapshot())
                    "authenticate" -> {
                        if (pending != null) {result.error("AUTH_BUSY","A sign-in is already open.",null);return@launch}
                        pending=result
                        activity.startActivityForResult(Intent(activity,GrozoClerkAuthActivity::class.java).putExtra("mode",call.argument<String>("mode")?:"signInOrUp"),authRequest)
                    }
                    "getToken" -> {
                        if (!Clerk.isAuthFlowComplete || Clerk.session == null) { result.success(null);return@launch }
                        when(val response = withTimeout(20_000) { Clerk.auth.getToken(GetTokenOptions(skipCache=call.argument<Boolean>("forceRefresh")==true)) }) {
                            is ClerkResult.Success -> result.success(response.value)
                            is ClerkResult.Failure -> result.error("TOKEN_UNAVAILABLE","Could not renew the session. Check your connection.",null)
                        }
                    }
                    "setActiveSession" -> {
                        val id=call.argument<String>("sessionId") ?: ""
                        // Only SDK-held active sessions are switchable; no user-provided token import.
                        check(Clerk.sessionsFlow.value.any { it.id==id && it.status.name=="ACTIVE" })
                        when(val response=withTimeout(20_000) {Clerk.auth.setActive(id)}) {
                            is ClerkResult.Success -> result.success(snapshot())
                            is ClerkResult.Failure -> result.error("SESSION_SWITCH_FAILED","Could not switch account.",null)
                        }
                    }
                    else -> result.notImplemented()
                }
            } catch (_: TimeoutCancellationException) { result.error("CLERK_TIMEOUT","Secure sign-in timed out. Check your connection and retry.",null) }
            catch(cancel: CancellationException) {throw cancel}
            catch (_: Exception) { pending=null;result.error("CLERK_UNAVAILABLE","Secure sign-in is unavailable or not configured. Contact Grozo support.",null) }
        }
    }
    fun onActivityResult(requestCode: Int,resultCode: Int): Boolean {
        if(requestCode!=authRequest) return false
        val response=pending; pending=null
        if(resultCode==Activity.RESULT_OK && Clerk.isAuthFlowComplete) response?.success(snapshot())
        else response?.error("AUTH_CANCELLED","Sign-in was cancelled.",null)
        return true
    }
    fun detach() {
        pending?.error("AUTH_CANCELLED","Authentication activity was detached.",null);pending=null
        onCancel(null);methods.setMethodCallHandler(null);events.setStreamHandler(null);scope.cancel()
    }
}
