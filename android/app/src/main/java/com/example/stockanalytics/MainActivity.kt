package com.example.stockanalytics

import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Important for correct WebView behavior
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                view?.loadUrl(request?.url.toString())
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                view?.loadData(
                    "<html><body><h2>Network error</h2><p>${error?.description}</p></body></html>",
                    "text/html",
                    "UTF-8"
                )
            }
        }

        webView.loadUrl("https://stocks-analytics-muul.vercel.app")
        setContentView(webView)
    }
}
