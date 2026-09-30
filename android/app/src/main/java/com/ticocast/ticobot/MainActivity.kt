package com.ticocast.ticobot

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {
    private var pendingChatPhone by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Target SDK 35 enforces edge-to-edge; Compose screens pad themselves via statusBarsPadding().
        WindowCompat.setDecorFitsSystemWindows(window, false)
        pendingChatPhone = intent?.getStringExtra("chat_phone")

        setContent {
            TicoBotApp(
                pendingChatPhone = pendingChatPhone,
                onPendingChatConsumed = { pendingChatPhone = null },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("chat_phone")?.let { pendingChatPhone = it }
    }
}
