package pl.imperium.app;

import java.net.URI;
import java.util.Locale;

/** Browser rules never apply to the trusted IMPERIUM app or its API calls. */
public final class BrowserPolicy {
 private static final String[] AD_HOSTS={"doubleclick.net","googlesyndication.com","googleadservices.com","adservice.google.com","ads.youtube.com","adnxs.com","adsrvr.org","criteo.com","criteo.net","taboola.com","outbrain.com","pubmatic.com","rubiconproject.com","openx.net","casalemedia.com","smartadserver.com","adform.net","advertising.com","amazon-adsystem.com","moatads.com","scorecardresearch.com","quantserve.com","demdex.net","zedo.com","trafficjunky.net","popads.net","popcash.net"};
 public static boolean webUrl(String value){try{URI u=new URI(value);return "https".equalsIgnoreCase(u.getScheme())&&u.getHost()!=null&&u.getRawUserInfo()==null;}catch(Exception e){return false;}}
 public static boolean host(String actual,String domain){return actual!=null&&(actual.equals(domain)||actual.endsWith("."+domain));}
 public static boolean block(String value,boolean mainFrame){
  if(mainFrame)return false;
  try{URI u=new URI(value);String h=u.getHost();if(h==null)return false;h=h.toLowerCase(Locale.ROOT);for(String ad:AD_HOSTS)if(host(h,ad))return true;
   String path=u.getPath();return host(h,"youtube.com")&&path!=null&&(path.startsWith("/pagead/")||path.startsWith("/api/stats/ads"));
  }catch(Exception e){return false;}
 }
 private BrowserPolicy(){}
}
