package pl.imperium.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/** Untrusted internet content gets NO app bridge, file access, or app API tokens. */
public class BrowserActivity extends Activity {
 private WebView browser;private EditText address;private TextView status,shield;private ProgressBar progress;
 private LinearLayout root;private View fullView;private WebChromeClient.CustomViewCallback fullCallback;
 private volatile boolean filtering=true;private final AtomicInteger blocked=new AtomicInteger();private String current="";
 private final int bg=Color.rgb(8,12,16),panel=Color.rgb(17,26,35),text=Color.rgb(232,240,246),red=Color.rgb(229,43,61);
 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private GradientDrawable box(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(6));d.setStroke(dp(1),Color.rgb(44,63,77));return d;}
 private TextView label(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextColor(text);t.setTextSize(size);t.setGravity(17);t.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));return t;}
 private TextView button(String title,String description,Runnable click){TextView b=label(title,21);b.setContentDescription(description);b.setBackground(box(panel));b.setPadding(dp(9),0,dp(9),0);b.setOnClickListener(v->click.run());return b;}
 private void addButton(LinearLayout row,TextView b){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(46),1);p.setMargins(dp(3),0,dp(3),0);row.addView(b,p);}
 @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(bg);getWindow().setNavigationBarColor(bg);
  root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(bg);root.setPadding(dp(9),dp(8),dp(9),dp(8));setContentView(root);
  LinearLayout header=new LinearLayout(this);header.setGravity(16);TextView close=button("×","Wróć do IMPERIUM",this::finish);header.addView(close,new LinearLayout.LayoutParams(dp(44),dp(44)));TextView name=label("UMBRELLA  /  WEB",12);name.setLetterSpacing(.13f);name.setTypeface(null,Typeface.BOLD);header.addView(name,new LinearLayout.LayoutParams(0,dp(44),1));shield=label("◇ ON",11);shield.setTextColor(Color.rgb(127,216,180));shield.setPadding(dp(10),0,dp(10),0);shield.setOnClickListener(v->{filtering=!filtering;blocked.set(0);status();browser.reload();});shield.setContentDescription("Włącz lub wyłącz filtr reklam");header.addView(shield,new LinearLayout.LayoutParams(dp(64),dp(44)));root.addView(header);
  address=new EditText(this);address.setSingleLine(true);address.setTextColor(text);address.setTextSize(14);address.setHintTextColor(Color.rgb(139,160,176));address.setHint("Adres lub wyszukiwanie");address.setBackground(box(panel));address.setPadding(dp(13),0,dp(13),0);address.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);address.setImeOptions(EditorInfo.IME_ACTION_GO);address.setSelectAllOnFocus(true);LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,dp(48));ap.setMargins(0,dp(10),0,dp(4));root.addView(address,ap);address.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_GO||(event!=null&&event.getKeyCode()==66)){navigate(address.getText().toString());return true;}return false;});
  status=label("HTTPS · PRZESTRZEŃ PRYWATNA",9);status.setTextColor(Color.rgb(150,169,184));status.setGravity(3|16);status.setPadding(dp(4),0,0,0);root.addView(status,new LinearLayout.LayoutParams(-1,dp(25)));progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(red));root.addView(progress,new LinearLayout.LayoutParams(-1,dp(2)));
  browser=new WebView(this);browser.setBackgroundColor(bg);WebSettings s=browser.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);CookieManager.getInstance().setAcceptThirdPartyCookies(browser,false);
  browser.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!BrowserPolicy.webUrl(request.getUrl().toString())){Toast.makeText(BrowserActivity.this,"Obsługiwane są bezpieczne adresy HTTPS.",Toast.LENGTH_SHORT).show();return true;}return false;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){if(filtering&&BrowserPolicy.block(request.getUrl().toString(),request.isForMainFrame())){blocked.incrementAndGet();runOnUiThread(()->status());return new WebResourceResponse("text/plain","UTF-8",204,"No Content",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}return null;}
   @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){current=url;blocked.set(0);address.setText(url);status();}
   @Override public void onPageFinished(WebView view,String url){current=url;address.setText(url);address.clearFocus();status();
    if(filtering&&BrowserPolicy.host(Uri.parse(url).getHost(),"youtube.com"))view.evaluateJavascript("(()=>{if(window.__imperiumFilter)clearInterval(window.__imperiumFilter);const style=document.createElement('style');style.textContent='ytm-promoted-sparkles-web-renderer,ytm-promoted-video-renderer,ytd-ad-slot-renderer,.ytp-ad-overlay-container{display:none!important}';document.head.appendChild(style);window.__imperiumFilter=setInterval(()=>{const p=document.querySelector('.ad-showing');if(p){const b=p.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button,.ytp-ad-skip-button-modern');if(b&&!b.disabled)b.click();}},1000);})();",null);
   }
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();Toast.makeText(BrowserActivity.this,"Nieprawidłowy certyfikat strony. Połączenie przerwane.",Toast.LENGTH_LONG).show();}
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())status.setText("Nie udało się otworzyć strony. Sprawdź adres lub połączenie.");}
  });
  browser.setWebChromeClient(new WebChromeClient(){
   @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value==100?View.INVISIBLE:View.VISIBLE);}
   @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,false,false);}
   @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullView!=null){callback.onCustomViewHidden();return;}fullView=view;fullCallback=callback;root.setVisibility(View.GONE);((ViewGroup)getWindow().getDecorView()).addView(view,new ViewGroup.LayoutParams(-1,-1));}
   @Override public void onHideCustomView(){closeFull();}
  });
  browser.setDownloadListener((url,ua,disposition,mime,length)->external(url));root.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
  LinearLayout controls=new LinearLayout(this);controls.setPadding(0,dp(8),0,0);addButton(controls,button("‹","Wstecz",()->{if(browser.canGoBack())browser.goBack();}));addButton(controls,button("›","Dalej",()->{if(browser.canGoForward())browser.goForward();}));addButton(controls,button("↻","Odśwież",()->browser.reload()));addButton(controls,button("☆","Zapisz zakładkę",this::saveBookmark));addButton(controls,button("☰","Menu przeglądarki",this::menu));root.addView(controls);
  String url=getIntent().getStringExtra("url");navigate(url==null?"https://duckduckgo.com/":url);
 }
 private void status(){String h=Uri.parse(current).getHost();status.setText((h==null?"HTTPS":h)+"  ·  zablokowano: "+blocked.get());shield.setText(filtering?"◇ ON":"◇ OFF");shield.setTextColor(filtering?Color.rgb(127,216,180):Color.rgb(255,161,171));}
 private void navigate(String input){String value=input.trim();if(!value.startsWith("https://")){if(value.matches("(?i)^[a-z][a-z0-9+.-]*:.*")){Toast.makeText(this,"Dozwolone są tylko adresy HTTPS.",Toast.LENGTH_SHORT).show();return;}value=value.contains(".")&&!value.contains(" ")?"https://"+value:"https://duckduckgo.com/?q="+Uri.encode(value);}if(!BrowserPolicy.webUrl(value)){Toast.makeText(this,"Nieprawidłowy adres.",Toast.LENGTH_SHORT).show();return;}((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);address.clearFocus();browser.loadUrl(value);}
 private JSONArray bookmarks(){try{return new JSONArray(getSharedPreferences("imperium_browser",0).getString("bookmarks","[]"));}catch(Exception e){return new JSONArray();}}
 private void saveBookmark(){if(!BrowserPolicy.webUrl(current))return;try{JSONArray a=bookmarks();for(int i=0;i<a.length();i++)if(current.equals(a.getJSONObject(i).optString("url"))){Toast.makeText(this,"Ta strona jest już w zakładkach.",0).show();return;}a.put(new JSONObject().put("url",current).put("title",browser.getTitle()));getSharedPreferences("imperium_browser",0).edit().putString("bookmarks",a.toString()).apply();Toast.makeText(this,"Zakładka zapisana.",0).show();}catch(Exception ignored){}}
 private void menu(){new AlertDialog.Builder(this).setTitle("UMBRELLA / WEB").setItems(new String[]{"Moje zakładki","Otwórz w przeglądarce systemowej","Wyczyść historię i dane stron","Wróć do IMPERIUM"},(d,index)->{if(index==0){JSONArray a=bookmarks();String[] names=new String[a.length()];for(int i=0;i<a.length();i++)names[i]=a.optJSONObject(i).optString("title",a.optJSONObject(i).optString("url"));new AlertDialog.Builder(this).setTitle(a.length()==0?"Brak zapisanych stron":"Zakładki").setItems(names,(dd,n)->navigate(a.optJSONObject(n).optString("url"))).setNegativeButton("Zamknij",null).show();}else if(index==1)external(current);else if(index==2)new AlertDialog.Builder(this).setMessage("Usunąć historię, pliki cookie i dane przeglądanych stron? Zakładki pozostaną.").setPositiveButton("Wyczyść",(x,y)->{browser.clearHistory();browser.clearCache(true);CookieManager.getInstance().removeAllCookies(null);WebStorage.getInstance().getOrigins(origins->{for(Object entry:origins.keySet()){String origin=String.valueOf(entry);if(origin.startsWith("https://")||origin.startsWith("http://"))WebStorage.getInstance().deleteOrigin(origin);}});navigate("https://duckduckgo.com/");}).setNegativeButton("Anuluj",null).show();else finish();}).show();}
 private void external(String url){if(!BrowserPolicy.webUrl(url))return;try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){Toast.makeText(this,"Brak przeglądarki systemowej.",0).show();}}
 private void closeFull(){if(fullView==null)return;((ViewGroup)getWindow().getDecorView()).removeView(fullView);fullView=null;root.setVisibility(View.VISIBLE);if(fullCallback!=null)fullCallback.onCustomViewHidden();fullCallback=null;}
 @Override public void onBackPressed(){if(fullView!=null)closeFull();else if(browser.canGoBack())browser.goBack();else finish();}
 @Override protected void onResume(){super.onResume();AnnouncementAlerts.foreground(this,true);}
 @Override protected void onPause(){AnnouncementAlerts.foreground(this,false);super.onPause();}
 @Override protected void onDestroy(){if(browser!=null){browser.stopLoading();browser.destroy();}super.onDestroy();}
}
