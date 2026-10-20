import java.util.Properties
plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services") apply false
}

// FCM remains enabled by default. A local debug APK can explicitly omit project-specific Firebase wiring.
val disableFirebaseForDebug = providers.gradleProperty("disableFirebase").orNull == "true"
if (disableFirebaseForDebug && gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }) {
    throw GradleException("Firebase may be disabled only for local debug builds. Configure an owned Firebase project for release.")
}
if (!disableFirebaseForDebug) apply(plugin = "com.google.gms.google-services")

// Google Maps key: Gradle property MAPS_API_KEY, else env KRAVEO_MAPS_API_KEY, else empty. It is
// only ever injected into the manifest placeholder; it is never written to the repository. With
// no key the build still succeeds and the app shows its plain (non-Google) delivery card.
fun nonBlank(value: Any?): String? = value?.toString()?.trim()?.takeIf { it.isNotEmpty() }
val mapsApiKey: String = nonBlank(project.findProperty("MAPS_API_KEY")) ?: nonBlank(System.getenv("KRAVEO_MAPS_API_KEY")) ?: ""

val marketBrand = Properties().apply {
    rootProject.file("../../../branding/android.properties").inputStream().use { load(it) }
}

android {
    namespace = "site.kraveo.driver"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications needs Java 8+ library desugaring (push notifications).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = marketBrand.getProperty("driver.applicationId")
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
