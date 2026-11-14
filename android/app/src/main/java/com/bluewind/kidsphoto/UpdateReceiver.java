package com.bluewind.kidsphoto;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;
import java.io.File;

/**
 * Receives Android `PackageInstaller` session completion callbacks for `KIDS_Photo` self-updates.
 */
public final class UpdateReceiver extends BroadcastReceiver {
    @SuppressWarnings("deprecation")
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        switch (status) {
            case PackageInstaller.STATUS_PENDING_USER_ACTION: {
                Intent confirmIntent = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    AppUpdater.setLastStatus(context, "설치 확인 창이 열렸습니다. [업데이트]를 눌러 주세요.");
                    try {
                        context.startActivity(confirmIntent);
                        return;
                    } catch (Exception ignored) {}
                }
                String apkPath = intent.getStringExtra("apk_path");
                if (apkPath != null) {
                    File f = new File(apkPath);
                    if (f.isFile()) {
                        AppUpdater.launchFallbackFileProviderInstall(context, f);
                    }
                }
                return;
            }
            case PackageInstaller.STATUS_SUCCESS: {
                AppUpdater.setLastStatus(context, "");
                Toast.makeText(context, "토순이네 스마트 액자 업데이트가 완료되었습니다!", Toast.LENGTH_SHORT).show();
                try {
                    Intent relaunch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                    if (relaunch != null) {
                        relaunch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        context.startActivity(relaunch);
                    }
                } catch (Exception ignored) {}
                return;
            }
            case PackageInstaller.STATUS_FAILURE_ABORTED: {
                AppUpdater.setLastStatus(context, "업데이트 설치가 취소되었습니다.");
                return;
            }
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE: {
                String msg = "기존 앱 서명과 달라 덮어쓸 수 없습니다. 기존 앱을 1회 삭제 후 설치해 주세요.";
                AppUpdater.setLastStatus(context, msg);
                Toast.makeText(context, msg, Toast.LENGTH_LONG).show();
                return;
            }
            default: {
                String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                String msg = "업데이트 설치 실패" + (detail != null ? (": " + detail) : "");
                AppUpdater.setLastStatus(context, msg);
                Toast.makeText(context, msg, Toast.LENGTH_LONG).show();
            }
        }
    }
}
