package pl.imperium.app;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class PlannerBootReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){
  String a=intent.getAction();
  if(Intent.ACTION_BOOT_COMPLETED.equals(a)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)||Intent.ACTION_TIME_CHANGED.equals(a)||Intent.ACTION_TIMEZONE_CHANGED.equals(a)||"android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(a))PlannerReminders.restore(context);
 }
}
