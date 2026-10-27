package com.zaballgam.gunbbu;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // 시스템 「글자 크기」를 키워 둔 폰에서도 화면 배치가 안 깨지게 웹뷰 글자 배율을 100%로 고정한다.
        // 게임 화면은 360×780 고정 무대라 글자만 커지면 HUD·버튼 줄이 무너진다.
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.getSettings().setTextZoom(100);
            }
        }
    }
}
