package pl.imperium.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class BrowserPolicyTest {
 @Test public void safeAddresses(){assertTrue(BrowserPolicy.webUrl("https://m.youtube.com/watch?v=1"));for(String s:new String[]{"javascript:alert(1)","file:///data/data/pl.imperium.app/files/x","content://files/x","intent://open","http://example.com","https://user:pass@example.com","https://"})assertFalse(s,BrowserPolicy.webUrl(s));}
 @Test public void filtersPreserveVideosAndMainPages(){assertTrue(BrowserPolicy.block("https://googleads.g.doubleclick.net/pagead/x",false));assertTrue(BrowserPolicy.block("https://www.youtube.com/api/stats/ads?x=1",false));assertFalse(BrowserPolicy.block("https://googleads.g.doubleclick.net",true));assertFalse(BrowserPolicy.block("https://doubleclick.net.example.org/news",false));assertFalse(BrowserPolicy.block("https://r1.googlevideo.com/videoplayback",false));assertFalse(BrowserPolicy.block("https://www.youtube.com/youtubei/v1/player",false));}
}
