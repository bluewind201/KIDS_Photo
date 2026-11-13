package com.bluewind.kidsphoto;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import androidx.core.content.ContextCompat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Discovers all calendars registered on the Android phone/tablet (Google Calendar, Samsung Calendar,
 * Naver, Microsoft Exchange/Outlook, Shared Family Calendars, Holidays) so the user can choose
 * which specific calendars to sync onto the Smart Frame.
 */
public final class NativeCalendarHelper {
    private NativeCalendarHelper() {}

    public static boolean hasPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR)
            == PackageManager.PERMISSION_GRANTED;
    }

    public static String listDeviceCalendarsJson(Context context) {
        JSONArray arr = new JSONArray();
        if (!hasPermission(context)) {
            return arr.toString();
        }

        String[] projection = new String[] {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.VISIBLE
        };

        ContentResolver cr = context.getContentResolver();
        try (
            Cursor cursor = cr.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                null,
                null,
                CalendarContract.Calendars.ACCOUNT_NAME + " ASC, " +
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC"
            )
        ) {
            if (cursor == null) return arr.toString();
            while (cursor.moveToNext()) {
                long calId = cursor.getLong(0);
                String displayName = cursor.getString(1);
                String rawName = cursor.getString(2);
                String accountName = cursor.getString(3);
                String accountType = cursor.getString(4);
                int colorInt = cursor.getInt(5);
                int visible = cursor.getInt(6);

                String finalName =
                    (displayName != null && !displayName.trim().isEmpty())
                        ? displayName.trim()
                        : (rawName != null && !rawName.trim().isEmpty() ? rawName.trim() : "내 캘린더 #" + calId);

                String providerLabel = formatAccountProviderLabel(accountType, accountName);
                String colorHex = colorInt != 0
                    ? String.format(Locale.US, "#%06X", (0xFFFFFF & colorInt))
                    : "#4F46E5";

                JSONObject obj = new JSONObject();
                obj.put("nativeCalendarId", String.valueOf(calId));
                obj.put("name", finalName);
                obj.put("accountName", providerLabel);
                obj.put("colorHex", colorHex);
                obj.put("visibleByDefault", visible == 1);
                arr.put(obj);
            }
        } catch (Exception ignored) {}

        return arr.toString();
    }

    public static String getSelectedCalendarEventsJson(
        Context context,
        String calendarIdsJson,
        int daysAhead
    ) {
        JSONArray arr = new JSONArray();
        if (!hasPermission(context)) {
            return arr.toString();
        }

        Set<String> allowedIds = new HashSet<>();
        try {
            JSONArray rawIds = new JSONArray(calendarIdsJson != null ? calendarIdsJson : "[]");
            for (int i = 0; i < rawIds.length(); i++) {
                String id = rawIds.optString(i, "").trim();
                if (!id.isEmpty()) allowedIds.add(id);
            }
        } catch (Exception ignored) {}

        if (allowedIds.isEmpty()) {
            return arr.toString();
        }

        int safeDays = Math.max(7, Math.min(120, daysAhead > 0 ? daysAhead : 45));

        Calendar startCal = Calendar.getInstance();
        startCal.set(Calendar.HOUR_OF_DAY, 0);
        startCal.set(Calendar.MINUTE, 0);
        startCal.set(Calendar.SECOND, 0);
        startCal.set(Calendar.MILLISECOND, 0);
        long startMillis = startCal.getTimeInMillis();
        long endMillis = startMillis + (safeDays * 24L * 60L * 60L * 1000L);

        Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, startMillis);
        ContentUris.appendId(builder, endMillis);

        String[] projection = new String[] {
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.DISPLAY_COLOR,
            CalendarContract.Instances.STATUS
        };

        ContentResolver cr = context.getContentResolver();
        try (
            Cursor cursor = cr.query(
                builder.build(),
                projection,
                null,
                null,
                CalendarContract.Instances.BEGIN + " ASC"
            )
        ) {
            if (cursor == null) return arr.toString();
            int count = 0;
            while (cursor.moveToNext() && count < 100) {
                long eventId = cursor.getLong(0);
                String calIdStr = String.valueOf(cursor.getLong(1));
                if (!allowedIds.contains(calIdStr)) continue;

                int status = cursor.isNull(9) ? 0 : cursor.getInt(9);
                if (status == CalendarContract.Events.STATUS_CANCELED) continue;

                String calName = cursor.getString(2);
                String title = cursor.getString(3);
                if (title == null || title.trim().isEmpty()) continue;

                long begin = cursor.getLong(4);
                long end = cursor.getLong(5);
                boolean allDay = cursor.getInt(6) == 1;
                String loc = cursor.getString(7);
                int colorInt = cursor.getInt(8);
                String colorHex = colorInt != 0
                    ? String.format(Locale.US, "#%06X", (0xFFFFFF & colorInt))
                    : "#4F46E5";

                JSONObject ev = new JSONObject();
                ev.put("id", "devcal-" + calIdStr + "-" + eventId + "-" + begin);
                ev.put("calendarId", calIdStr);
                ev.put("calendarName", calName != null ? calName : "내 캘린더");
                ev.put("title", title.trim());
                ev.put("startMillis", begin);
                ev.put("endMillis", end);
                ev.put("allDay", allDay);
                ev.put("location", loc != null ? loc.trim() : "");
                ev.put("colorHex", colorHex);
                arr.put(ev);
                count++;
            }
        } catch (Exception ignored) {}

        return arr.toString();
    }

    private static String formatAccountProviderLabel(String accountType, String accountName) {
        String acct = accountName != null ? accountName.trim() : "";
        String type = accountType != null ? accountType.toLowerCase(Locale.ROOT) : "";
        String brand;
        if (type.contains("google")) {
            brand = "Google";
        } else if (type.contains("samsung") || type.contains("osp.app") || type.contains("local")) {
            brand = "삼성·기기";
        } else if (type.contains("naver")) {
            brand = "네이버";
        } else if (type.contains("microsoft") || type.contains("exchange") || type.contains("outlook")) {
            brand = "Outlook";
        } else if (type.contains("kakao")) {
            brand = "카카오";
        } else {
            brand = "기기 계정";
        }
        if (acct.isEmpty() || acct.equalsIgnoreCase("local") || acct.contains("local")) {
            return brand + " 내장 캘린더";
        }
        return brand + " · " + acct;
    }
}
