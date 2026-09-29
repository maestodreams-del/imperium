plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

android {
    namespace = "pl.imperium.app"
    compileSdk = 35

    signingConfigs {
        create("release") {
            storeFile = file("../imperium-release.jks")
            storePassword = System.getenv("IMPERIUM_KEYSTORE_PASSWORD")
            keyAlias = "imperium"
            keyPassword = System.getenv("IMPERIUM_KEY_PASSWORD")
        }
    }

    defaultConfig {
        applicationId = "pl.imperium.app"
        minSdk = 26
        targetSdk = 35

        versionCode = 15
        versionName = "5.3.0"
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
}
