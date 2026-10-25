package pl.imperium.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** Device-local task alarms. No passwords or session tokens are stored here. */
public final class PlannerReminders {
    private static final String PREFS="imperium_planner_reminders", CHANNEL="imperium_planner_v1";
    private PlannerReminders(){}
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static JSONArray stored(Context c){try{return new JSONArray(prefs(c).getString("items","[]"));}catch(Exception e){return new JSONArray();}}
    private static PendingIntent pending(Context c,String id){
        Intent i=new Intent(c,PlannerReminderReceiver.class).setData(Uri.parse("imperium://reminder/"+Uri.encode(id))).putExtra("taskId",id);
        return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static synchronized void replace(Context c,String json){
        if(json==null||json.length()>150000)return;
        try{
            JSONArray incoming=new JSONArray(json),safe=new JSONArray();
            for(int n=0;n<Math.min(incoming.length(),101);n++){
                JSONObject x=incoming.getJSONObject(n);String id=x.optString("id","");long at=x.optLong("at",0);
                if(!id.matches("[a-zA-Z0-9-]{1,80}")||at<1)continue;
                JSONObject row=new JSONObject();row.put("id",id);row.put("at",at);
                row.put("title",truncate(x.optString("title","IMPERIUM"),300));row.put("body",truncate(x.optString("body",""),500));safe.put(row);
            }
            AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
            JSONArray old=stored(c);for(int n=0;n<old.length();n++)am.cancel(pending(c,old.getJSONObject(n).getString("id")));
            prefs(c).edit().putString("items",safe.toString()).apply();
            restore(c);
        }catch(Exception ignored){}
    }
    private static String truncate(String x,int max){return x.length()>max?x.substring(0,max):x;}
    public static synchronized void restore(Context c){
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);JSONArray items=stored(c);long now=System.currentTimeMillis();
        for(int n=0;n<items.length();n++)try{
            JSONObject x=items.getJSONObject(n);String id=x.getString("id");long at=x.getLong("at");
            if(prefs(c).getLong("fired:"+id,0)==at||at<now-86400000L)continue;
            long trigger=Math.max(at,now+1000L);PendingIntent pi=pending(c,id);
            try{if(Build.VERSION.SDK_INT<31||am.canScheduleExactAlarms())am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,pi);else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,pi);}
            catch(SecurityException ex){am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,pi);}
        }catch(Exception ignored){}
    }
    public static synchronized void clear(Context c){
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);JSONArray old=stored(c);
        for(int n=0;n<old.length();n++)try{String id=old.getJSONObject(n).getString("id");am.cancel(pending(c,id));((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id,1);}catch(Exception ignored){}
        prefs(c).edit().clear().apply();
    }
    public static synchronized void deliver(Context c,String id){
        if(id==null)return;JSONArray rows=stored(c);
        for(int n=0;n<rows.length();n++)try{
            JSONObject x=rows.getJSONObject(n);if(!id.equals(x.getString("id")))continue;
            long at=x.getLong("at");if(prefs(c).getLong("fired:"+id,0)==at||at>System.currentTimeMillis()+1000)return;
            if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
            NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Напоминания о задачах",NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Личные задачи и фокус-таймер IMPERIUM");channel.enableVibration(true);nm.createNotificationChannel(channel);
            Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("plannerTaskId",id).setData(Uri.parse("imperium://task/"+Uri.encode(id)));
            PendingIntent tap=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(x.getString("title")).setContentText(x.getString("body")).setStyle(new Notification.BigTextStyle().bigText(x.getString("body"))).setContentIntent(tap).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_REMINDER).build();
            nm.notify(id,1,notification);prefs(c).edit().putLong("fired:"+id,at).apply();return;
        }catch(Exception ignored){}
    }
}
