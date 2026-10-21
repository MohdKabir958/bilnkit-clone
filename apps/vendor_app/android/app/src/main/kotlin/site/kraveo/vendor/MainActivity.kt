package site.kraveo.vendor

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var clerkBridge: com.grozo.clerk.GrozoClerkBridge? = null
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        clerkBridge = com.grozo.clerk.GrozoClerkBridge(this,flutterEngine.dartExecutor.binaryMessenger)
    }
    override fun onActivityResult(requestCode: Int,resultCode: Int,data: android.content.Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        clerkBridge?.onActivityResult(requestCode,resultCode)
    }
    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        clerkBridge?.detach();clerkBridge=null
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
