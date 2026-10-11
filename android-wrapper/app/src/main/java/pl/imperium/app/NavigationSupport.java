package pl.imperium.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.Locale;
import java.util.function.BooleanSupplier;

/** Foreground-only location: no tracking history, background access or shared positions. */
final class NavigationSupport implements LocationListener {
 static final int PERMISSION_REQUEST=9133;
 private final Activity activity;
 private final WebView web;
 private final BooleanSupplier trusted;
 private final LocationManager manager;
 private TextToSpeech speech;
 private boolean speakingReady=false,running=false,pendingPermission=false;
 NavigationSupport(Activity activity,WebView web,BooleanSupplier trusted){this.activity=activity;this.web=web;this.trusted=trusted;manager=(LocationManager)activity.getSystemService(Context.LOCATION_SERVICE);}
 void start(){
  if(!trusted.getAsBoolean())return;
  stop();
  if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){pendingPermission=true;activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},PERMISSION_REQUEST);return;}
  try{
   boolean enabled=false;running=true;
   for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER})if(manager.isProviderEnabled(provider)){manager.requestLocationUpdates(provider,1000,2,this,Looper.getMainLooper());enabled=true;}
   if(!enabled){running=false;error("Włącz lokalizację GPS w ustawieniach telefonu.");return;}
   activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
   if(speech==null)speech=new TextToSpeech(activity,status->{if(status==TextToSpeech.SUCCESS&&speech!=null){int result=speech.setLanguage(Locale.forLanguageTag("pl-PL"));speakingReady=result>=TextToSpeech.LANG_AVAILABLE;}});
  }catch(SecurityException ex){running=false;error("Zezwól IMPERIUM na dostęp do lokalizacji.");}catch(Exception ex){running=false;error("Nie można uruchomić GPS. Sprawdź ustawienia lokalizacji.");}
 }
 void permissionResult(){if(!pendingPermission)return;pendingPermission=false;if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)start();else error("Brak zgody na lokalizację. Możesz wskazać punkt na mapie.");}
 void stop(){running=false;try{manager.removeUpdates(this);}catch(Exception ignored){}activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(speech!=null)speech.stop();}
 void pause(){boolean active=running;stop();if(active)event("imperium-navigation-paused",new JSONObject());}
 void destroy(){stop();if(speech!=null){speech.shutdown();speech=null;}}
 void speak(String text){if(!running||!trusted.getAsBoolean()||!speakingReady||text==null||text.length()>1500)return;speech.speak(text,TextToSpeech.QUEUE_FLUSH,null,"imperium-navigation");}
 private void error(String text){try{JSONObject data=new JSONObject();data.put("message",text);event("imperium-navigation-error",data);}catch(Exception ignored){}}
 private void event(String name,JSONObject data){if(trusted.getAsBoolean())web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+data.toString()+"}))",null);}
 @Override public void onLocationChanged(Location location){if(!running||!trusted.getAsBoolean())return;try{JSONObject data=new JSONObject();data.put("latitude",location.getLatitude());data.put("longitude",location.getLongitude());data.put("accuracy",location.getAccuracy());data.put("timestamp",location.getTime());data.put("speed",location.hasSpeed()?location.getSpeed():0);event("imperium-navigation-location",data);}catch(Exception ignored){}}
 @Override public void onProviderDisabled(String provider){if(running)error("Utracono sygnał lokalizacji. Sprawdź GPS.");}
 @Override public void onProviderEnabled(String provider){}
 @Override public void onStatusChanged(String provider,int status,Bundle extras){}
}
