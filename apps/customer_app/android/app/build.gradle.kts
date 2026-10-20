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
// no key the build still succeeds and the app shows its plain (non-Google) tracking map.
fun nonBlank(value: Any?): String? = value?.toString()?.trim()?.takeIf { it.isNotEmpty() }
val mapsApiKey: String = nonBlank(project.findProperty("MAPS_API_KEY")) ?: nonBlank(System.getenv("KRAVEO_MAPS_API_KEY")) ?: ""

val marketBrand = Properties().apply {
    rootProject.file("../../../branding/android.properties").inputStream().use { load(it) }
}

android {
    namespace = "site.kraveo.customer"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Required by flutter_local_notifications (java.time on API 24+).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = marketBrand.getProperty("customer.applicationId")
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
    }

    val signingKeys = listOf("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
    val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
    if (releaseRequested && signingKeys.any { System.getenv(it).isNullOrBlank() }) {
        throw GradleException("Release requires an owned keystore: configure ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.")
    }
    signingConfigs {
        create("ownedRelease") {
            System.getenv("ANDROID_KEYSTORE_PATH")?.let { storeFile = file(it) }
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("ownedRelease")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
