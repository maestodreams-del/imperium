package pl.imperium.app;

import android.Manifest;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.*;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Minimal scoped notice credential, encrypted with the Android keystore. */
public final class AnnouncementAlerts {
 static final int JOB=604801,NOTIFICATION=604802;private static final String CHANNEL="imperium_announcements_v1",PREF="imperium_announcement_device",KEY="imperium.notice.device.v1";
 private static boolean visible=false,vibrating=false;
 private static SecretKey key()throws Exception{KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);if(!ks.containsAlias(KEY)){KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return gen.generateKey();}return (SecretKey)ks.getKey(KEY,null);}
 private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,Context.MODE_PRIVATE);}
 static synchronized String session(Context c)throws Exception{String value=prefs(c).getString("credential",null);if(value==null)return null;byte[] bytes=Base64.decode(value,Base64.NO_WRAP);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,bytes,0,12));return new String(cipher.doFinal(bytes,12,bytes.length-12),java.nio.charset.StandardCharsets.UTF_8);}
 public static synchronized void configure(Context c,String url,String apiKey,String token){
  if(!"https://kpqhmmietusedznadjjy.supabase.co".equals(url)||!token.matches("[a-f0-9]{64}"))return;
  try{String value=new JSONObject().put("url",url).put("key",apiKey).put("token",token).toString();if(!value.equals(session(c))){Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),iv=cipher.getIV(),all=new byte[iv.length+encrypted.length];System.arraycopy(iv,0,all,0,iv.length);System.arraycopy(encrypted,0,all,iv.length,encrypted.length);prefs(c).edit().putString("credential",Base64.encodeToString(all,Base64.NO_WRAP)).apply();}
   JobScheduler jobs=c.getSystemService(JobScheduler.class);if(jobs.getPendingJob(JOB)==null)jobs.schedule(new JobInfo.Builder(JOB,new ComponentName(c,AnnouncementJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build());
  }catch(Exception ignored){}
 }
 static JSONObject fetch(String session)throws Exception{
  JSONObject config=new JSONObject(session);URL url=new URL(config.getString("url")+"/rest/v1/rpc/imperium_device_notice");HttpURLConnection conn=(HttpURLConnection)url.openConnection();
  try{conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(10000);conn.setReadTimeout(10000);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("apikey",config.getString("key"));conn.setRequestProperty("Authorization","Bearer "+config.getString("key"));conn.setRequestProperty("Content-Type","application/json");byte[] body=new JSONObject().put("p_token",config.getString("token")).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);try(OutputStream out=conn.getOutputStream()){out.write(body);}if(conn.getResponseCode()!=200)throw new IOException("Notice sync unavailable");ByteArrayOutputStream output=new ByteArrayOutputStream();try(InputStream input=conn.getInputStream()){byte[] b=new byte[2048];int n;while((n=input.read(b))!=-1){output.write(b,0,n);if(output.size()>32768)throw new IOException("Invalid notice response");}}return new JSONObject(output.toString("UTF-8"));}finally{conn.disconnect();}
 }
 static void check(Context c){try{String before=session(c);if(before==null)return;JSONObject data=fetch(before);synchronized(AnnouncementAlerts.class){if(!before.equals(session(c)))return;setUnread(c,data.optBoolean("active")?data.optInt("unread_count"):0,true);}}catch(Exception ignored){}}
 public static void openBrowser(Activity activity,String url){if(!BrowserPolicy.webUrl(url))return;new Thread(()->{try{String s=session(activity);if(s==null)throw new IOException();JSONObject data=fetch(s);if(!s.equals(session(activity))||!data.optBoolean("active")||!data.optBoolean("owner"))throw new IOException();activity.runOnUiThread(()->activity.startActivity(new Intent(activity,BrowserActivity.class).putExtra("url",url)));}catch(Exception e){activity.runOnUiThread(()->android.widget.Toast.makeText(activity,"Nie udało się potwierdzić dostępu właściciela. Odśwież ogłoszenia i spróbuj ponownie.",android.widget.Toast.LENGTH_LONG).show());}}).start();}
 public static synchronized void setUnread(Context c,int count,boolean remind){count=Math.max(0,count);int previous=prefs(c).getInt("unread",0);prefs(c).edit().putInt("unread",count).apply();vibration(c,count);
  NotificationManager manager=c.getSystemService(NotificationManager.class);if(count==0){manager.cancel(NOTIFICATION);return;}
  NotificationChannel channel=new NotificationChannel(CHANNEL,"IMPERIUM — ogłoszenia",NotificationManager.IMPORTANCE_HIGH);channel.setDescription("Ogłoszenia wymagające potwierdzenia przeczytania");channel.enableVibration(true);channel.setVibrationPattern(new long[]{0,180,120,180});channel.setSound(null,null);manager.createNotificationChannel(channel);
  if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  if(count==previous&&!remind)return;
  Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("announcements",true);PendingIntent pi=PendingIntent.getActivity(c,NOTIFICATION,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification notification=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("IMPERIUM · nowe ogłoszenie").setContentText("Do przeczytania: "+count+". Otwórz i zaznacz „Przeczytano”.").setContentIntent(pi).setOngoing(true).setAutoCancel(false).setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE).setColor(0xffe52b3d).build();manager.notify(NOTIFICATION,notification);
 }
 private static void vibration(Context c,int count){Vibrator v=(Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);if(v==null||!v.hasVibrator())return;if(!visible||count==0){v.cancel();vibrating=false;return;}if(!vibrating){AudioAttributes a=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();v.vibrate(VibrationEffect.createWaveform(new long[]{0,180,120,180,7520},0),a);vibrating=true;}}
 public static synchronized void foreground(Context c,boolean active){visible=active;vibration(c,prefs(c).getInt("unread",0));}
 public static synchronized void clear(Context c){prefs(c).edit().clear().apply();c.getSystemService(JobScheduler.class).cancel(JOB);setUnread(c,0,false);}
 private AnnouncementAlerts(){}
}
