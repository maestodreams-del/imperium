plugins {
    id("com.android.application")
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

        versionCode = 14
versionName = "5.2.7"
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
}
