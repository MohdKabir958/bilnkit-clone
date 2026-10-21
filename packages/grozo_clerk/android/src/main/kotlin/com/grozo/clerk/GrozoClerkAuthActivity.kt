package com.grozo.clerk

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.clerk.api.Clerk
import com.clerk.ui.auth.AuthMode
import com.clerk.ui.auth.AuthView
import com.clerk.api.ui.ClerkTheme
import com.clerk.api.ui.ClerkColors

/** Official native Clerk UI owns verification, recovery, MFA and browser OAuth state. */
class GrozoClerkAuthActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        GrozoClerkRuntime.configure(this)
        setResult(Activity.RESULT_CANCELED)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary=Color(0xFF005A26),secondary=Color(0xFF85D900))) {
                Surface {
                    if (!GrozoClerkRuntime.isConfigured()) Text("Clerk configuration is missing. Contact the Grozo operator.")
                    else {
                        val ready by Clerk.isInitialized.collectAsStateWithLifecycle()
                        if (!ready) Text("Connecting to secure sign-in…")
                        else AuthView(
                            clerkTheme=ClerkTheme(colors=ClerkColors(primary=Color(0xFF005A26),success=Color(0xFF005A26))),
                            mode = when(intent.getStringExtra("mode")) {"signUp" -> AuthMode.SignUp; "signIn" -> AuthMode.SignIn; else -> AuthMode.SignInOrUp},
                            persistIdentifiers=false,
                            preferGoogleOneTap=false, // Official external-browser OAuth, never an embedded WebView.
                            isDismissible=true,
                            logo={
                                val logoId=resources.getIdentifier("brand_logo","drawable",packageName)
                                if(logoId!=0) Image(painter=painterResource(logoId),contentDescription="Grozo",modifier=Modifier.width(180.dp).height(80.dp))
                                else Text("Grozo",style=MaterialTheme.typography.headlineLarge)
                            },
                            onDismiss={finish()},
                            onAuthComplete={setResult(Activity.RESULT_OK);finish()},
                        )
                    }
                }
            }
        }
    }
}
