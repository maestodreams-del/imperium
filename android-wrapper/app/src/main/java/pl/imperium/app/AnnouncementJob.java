package pl.imperium.app;
import android.app.job.JobService;
import android.app.job.JobParameters;
public class AnnouncementJob extends JobService {
 private volatile boolean stopped;
 @Override public boolean onStartJob(JobParameters parameters){stopped=false;new Thread(()->{AnnouncementAlerts.check(getApplicationContext());if(!stopped)jobFinished(parameters,false);}).start();return true;}
 @Override public boolean onStopJob(JobParameters parameters){stopped=true;return true;}
}
