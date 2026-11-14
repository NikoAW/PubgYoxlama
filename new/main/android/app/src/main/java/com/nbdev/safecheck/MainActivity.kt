package com.nbdev.safecheck

import android.app.AlertDialog
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.nbdev.safecheck.scan.DeviceChecks

class MainActivity : AppCompatActivity() {
    private val fn = FirebaseFunctions.getInstance()
    private var code: String? = null
    private var scanning = false
    private var finished = false
    private lateinit var box: LinearLayout

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(56, 56, 56, 56); setBackgroundColor(Color.parseColor("#0A0D14")) }
        setContentView(box); home()
    }

    private fun tv(t: String, sp: Float = 16f) = TextView(this).apply { text = t; textSize = sp; setTextColor(Color.WHITE); typeface = android.graphics.Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; setPadding(0, 12, 0, 12) }
    private fun btn(t: String, f: () -> Unit) = Button(this).apply { text = t; setOnClickListener { f() } }

    private fun home() {
        box.removeAllViews()
        box.addView(tv("SafeCheck", 44f)); box.addView(tv("SCAN KODUNU DAXİL EDİN", 18f))
        val et = EditText(this).apply { hint = "SCAN-XXXXXX"; setTextColor(Color.WHITE); setHintTextColor(Color.GRAY); gravity = Gravity.CENTER }
        box.addView(et)
        box.addView(btn("YOXLA") {
            val c = et.text.toString().trim().uppercase()
            if (!Regex("SCAN-[A-Z]{6}").matches(c)) { Toast.makeText(this, "Kod formatı səhvdir", Toast.LENGTH_LONG).show(); return@btn }
            consent(c)
        })
        box.addView(tv("Developed by NB Dev", 12f))
    }

    private fun consent(c: String) {
        AlertDialog.Builder(this).setTitle("CİHAZINIZI YOXLAMAQ ÜÇÜN LAZIM OLAN İCAZƏLƏR")
            .setMessage("SafeCheck yalnız cihazın texniki göstəricilərini və PUBG Mobile ilə əlaqəli məlumatları yoxlayır.\n\nŞəxsi şəkilləriniz, mesajlarınız, kontaktlarınız və şəxsi sənədləriniz yoxlanılmır.\n\nHeç bir əlavə Android icazəsi tələb olunmur.")
            .setPositiveButton("OXUDUM, TƏSDİQ EDİRƏM") { _, _ -> start(c) }.setNegativeButton("LƏĞV ET", null).show()
    }

    private fun start(c: String) {
        code = c; scanning = true; finished = false
        box.removeAllViews()
        val pct = tv("%0", 48f); val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        val msg = tv("YOXLANILIR...", 20f)
        box.addView(pct); box.addView(bar); box.addView(msg); box.addView(tv("Yoxlama tamamlanana qədər ekranı bağlamayın.", 13f))
        fun p(v: Int) = runOnUiThread { pct.text = "%$v"; bar.progress = v }
        fun fail(m: String) = runOnUiThread { scanning = false; box.removeAllViews(); box.addView(tv(m, 18f)); box.addView(btn("GERİ") { home() }) }
        Thread {
            try {
                val auth = FirebaseAuth.getInstance()
                if (auth.currentUser == null) Tasks.await(auth.signInAnonymously())
                Tasks.await(fn.getHttpsCallable("joinScan").call(mapOf("code" to c)))
                p(12)
                val results = DeviceChecks.run(this)
                p(38)
                val device = "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}"
                p(58)
                val payload = hashMapOf("code" to c, "results" to HashMap(results), "complete" to true, "device" to device)
                p(76)
                Tasks.await(fn.getHttpsCallable("submitResult").call(payload))
                finished = true; scanning = false; p(100)
                runOnUiThread { msg.text = "SCAN TAMAMLANDI"; box.addView(tv("SCANNERDƏN YOXLAMASINI İSTƏYİN.", 16f)); box.addView(btn("BAĞLA") { home() }) }
            } catch (e: Exception) { fail((e.cause ?: e).message ?: "Xəta baş verdi") }
        }.start()
    }

    override fun onStop() {
        super.onStop()
        val c = code
        if (scanning && !finished && c != null) Thread { try { Tasks.await(fn.getHttpsCallable("reportAbandon").call(mapOf("code" to c))) } catch (_: Exception) {} }.start()
    }
}
