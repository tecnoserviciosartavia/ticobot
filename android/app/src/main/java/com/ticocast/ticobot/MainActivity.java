package com.ticocast.ticobot;

import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

class LegacyWebActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		WebView webView = this.bridge.getWebView();
		ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
			Insets systemBars = windowInsets.getInsets(
				WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars()
			);
			view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
			return windowInsets;
		});
		ViewCompat.requestApplyInsets(webView);

		CookieManager cookieManager = CookieManager.getInstance();
		cookieManager.setAcceptCookie(true);

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
			cookieManager.setAcceptThirdPartyCookies(webView, true);
		}

		WebSettings settings = webView.getSettings();
		settings.setDomStorageEnabled(true);

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
			settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
		}
	}
}
