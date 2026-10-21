package com.grozo.clerk

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import com.clerk.api.Clerk

class GrozoClerkApplication : Application() {
    override fun onCreate() { super.onCreate(); GrozoClerkRuntime.configure(this) }
}

/** SDK-owned encrypted credentials only. The preference below is a non-credential logout tombstone. */
internal object GrozoClerkRuntime {
    private var key: String? = null
    private const val PREFS = "grozo_clerk_control"
    private const val LOGOUT_PENDING = "local_logout_pending"

    @Synchronized fun configure(context: Context) {
        @Suppress("DEPRECATION")
        val metadata = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData
        val mode = metadata?.getString("in.grozo.AUTH_MODE") ?: "legacy"
        if (mode == "legacy") return
        require(mode == "clerk-test" || mode == "clerk")
        val configured = metadata?.getString("in.grozo.CLERK_PUBLISHABLE_KEY") ?: ""
        // Fail closed without crashing the application: the bridge presents a configuration error.
        if (!configured.startsWith(if (mode == "clerk-test") "pk_test_" else "pk_live_")) return
        val controls = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (controls.getBoolean(LOGOUT_PENDING,false)) {
            Clerk.reset()
            controls.edit().remove(LOGOUT_PENDING).commit()
            key = null
        }
        if (key == null) { Clerk.initialize(context.applicationContext,configured); key = configured }
        check(key == configured)
    }

    fun isConfigured() = key != null
    fun clearLocal(context: Context) {
        val controls = context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
        // Commit the non-secret tombstone BEFORE removing encrypted SDK state (crash safe).
        check(controls.edit().putBoolean(LOGOUT_PENDING,true).commit())
        Clerk.reset()
        key = null
        check(controls.edit().remove(LOGOUT_PENDING).commit())
        configure(context)
    }
}
