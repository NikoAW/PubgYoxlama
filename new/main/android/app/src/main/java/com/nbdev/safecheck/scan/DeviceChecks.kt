package com.nbdev.safecheck.scan

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

object DeviceChecks {
    const val PUBG = "com.tencent.ig"

    fun run(ctx: Context): Map<String, Boolean?> {
        val cfg = JSONObject(ctx.assets.open("signatures.json").bufferedReader().readText())
        val pm = ctx.packageManager
        fun list(k: String) = cfg.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        fun installed(p: String) = try { pm.getPackageInfo(p, 0); true } catch (e: PackageManager.NameNotFoundException) { false }

        val cheat = list("cheatPackages")
        val pubgInstalled = installed(PUBG)
        return mapOf(
            "cheatApp" to if (cheat.isEmpty()) null else cheat.any(::installed),
            "pubgSignature" to pubgSignatureMismatch(pm, list("pubgOfficialSha256"), pubgInstalled),
            "pubgModifiedFiles" to null,
            "pubgSideloaded" to if (!pubgInstalled) null else installer(pm) != "com.android.vending",
            "virtualEnv" to (list("virtualEnvPackages").any(::installed) || isCloned(ctx)),
            "playIntegrity" to null,
            "root" to (isRoot() || list("rootPackages").any(::installed)),
            "emulator" to isEmulator(),
            "macroOverlay" to (list("macroPackages").any(::installed) || macroAccessibility(ctx)),
            "bootloaderCustomRom" to customRom(),
            "devOptionsAdb" to devOptions(ctx)
        )
    }

    private fun installer(pm: PackageManager): String? = try {
        if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(PUBG).installingPackageName
        else @Suppress("DEPRECATION") pm.getInstallerPackageName(PUBG)
    } catch (e: Exception) { null }

    @Suppress("DEPRECATION")
    private fun pubgSignatureMismatch(pm: PackageManager, official: List<String>, installed: Boolean): Boolean? {
        if (!installed || official.isEmpty()) return null
        return try {
            val sigs = if (Build.VERSION.SDK_INT >= 28)
                pm.getPackageInfo(PUBG, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners
            else pm.getPackageInfo(PUBG, PackageManager.GET_SIGNATURES).signatures
            val hashes = sigs?.map { MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).joinToString("") { b -> "%02x".format(b) } }
            if (hashes.isNullOrEmpty()) null else hashes.none { h -> official.any { it.equals(h, true) } }
        } catch (e: Exception) { null }
    }

    private fun isRoot(): Boolean {
        val paths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/app/Superuser.apk", "/data/adb/magisk")
        return paths.any { File(it).exists() } || Build.TAGS?.contains("test-keys") == true
    }

    private fun isEmulator(): Boolean {
        val f = Build.FINGERPRINT.lowercase(); val m = Build.MODEL.lowercase()
        return f.startsWith("generic") || f.contains("emulator") || m.contains("emulator") ||
            m.contains("android sdk built for") || Build.HARDWARE.lowercase().let { it.contains("goldfish") || it.contains("ranchu") || it.contains("vbox") } ||
            Build.MANUFACTURER.equals("Genymotion", true) || Build.PRODUCT.contains("sdk_gphone")
    }

    private fun isCloned(ctx: Context): Boolean =
        !ctx.filesDir.absolutePath.startsWith("/data/user/0/") && !ctx.filesDir.absolutePath.startsWith("/data/data/")

    private fun customRom(): Boolean? {
        val tags = Build.TAGS ?: return null
        val vbs = prop("ro.boot.verifiedbootstate")
        val lock = prop("ro.boot.flash.locked")
        return tags.contains("test-keys") || vbs == "orange" || lock == "0"
    }

    private fun prop(k: String): String? = try {
        Class.forName("android.os.SystemProperties").getMethod("get", String::class.java).invoke(null, k) as String
    } catch (e: Exception) { null }

    private fun macroAccessibility(ctx: Context): Boolean {
        val s = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return listOf("autoclick", "autotap", "macro", "repetitouch").any { s.contains(it, true) }
    }

    private fun devOptions(ctx: Context): Boolean =
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1 ||
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
}
