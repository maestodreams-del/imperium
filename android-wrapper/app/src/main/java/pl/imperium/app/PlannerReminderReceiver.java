package pl.imperium.app;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class PlannerReminderReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){PlannerReminders.deliver(context,intent.getStringExtra("taskId"));}
}
