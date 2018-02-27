package net.tarks.craftingmod.nccauth;


import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import net.tarks.craftingmod.nccauth.discord.DiscordPipe;
import net.tarks.craftingmod.nccauth.discord.ICommander;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.awt.*;
import java.io.*;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.security.CodeSource;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;

public class Main implements ICommander {
    private static final String cafeURL = "https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
    public static void main(String[] args){
        System.out.println("Hello World!");
        new Main(args);
    }

    private Gson g;
    private Main _this;
    private DiscordPipe discord;
    public Main(String[] args){
        _this = this;
        g = new GsonBuilder().create();

        File config_file = new File(getRootdir(),"config.json");
        Config cfg = null;
        trace("Config file: " + config_file.getAbsolutePath());
        if(config_file.exists() && config_file.canRead()){
            try {
                JsonReader reader = new JsonReader(new FileReader(config_file));
                cfg = g.fromJson(reader, new TypeToken<Config>(){}.getType());
            } catch (FileNotFoundException e) {
                e.printStackTrace();
            }
        }
        if(cfg == null){
            if(config_file.getParentFile().canWrite()){
                if(args.length == 1){
                    cfg = getNaverConfig(args[0]);
                    if(cfg.cafeID == -1 || cfg.articleID == -1){
                        System.exit(-1);
                        return;
                    }
                    Util.write(config_file,Util.getJsonPretty(
                            g.toJson(cfg)
                    ));
                    trace("##################################");
                    trace("설정 파일이 생성되었습니다.");
                    trace(config_file.getAbsolutePath() + "을(를) 확인해주세요.");
                    trace("디스코드 봇 토큰과 방 ID가 필요합니다.");
                    trace("##################################");
                    try {
                        Desktop.getDesktop().open(config_file.getParentFile());
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                    System.exit(0);
                }else{
                    trace("##################################");
                    trace("설정 파일을 생성하기 위하여 파라메터로");
                    trace("카페 게시글 url(Ex. http://cafe.naver.com/sdbx/7155)을 입력해주세요.");
                    trace("##################################");
                    System.exit(0);
                }
            }
        }
        if(cfg.discordToken.equalsIgnoreCase("Please type discord bot token here.") || cfg.discordBotChID == -1 || cfg.discordRoomID == -1){
            traceE("Discord 설정을 완료해주세요!");
            try {
                Desktop.getDesktop().open(config_file.getParentFile());
            } catch (IOException e) {
                e.printStackTrace();
            }
            System.exit(-1);
        }
        //Config cfg = new Config(26686242,7156);
        //cfg = new Config(23370764,783788,"",0);

        getComments(cfg,-1); // 5 hours?

        discord = new DiscordPipe(cfg,this);
    }
    public Config getNaverConfig(String id){
        Config out = new Config("Please type discord bot token here.","Cafe URL..");
        Document document = null;
        try{
            document = getUrlDOM(id);
        } catch (IOException e) {
            e.printStackTrace();
        }
        if(document == null || document.title().contains("로그인")){
            traceE("네이버 게시물을 전체 공개로 해주세요.");
            return out;
        }
        Elements es = document.getElementsByAttributeValue("name","articleDeleteFrm");
        if(es.size() == 1){
            Element roote = es.get(0);
            Elements e = roote.getElementsByAttributeValue("name","clubid");
            if(e.size() == 1){
                out.cafeID = Long.parseLong(e.get(0).attr("value"));
            }
            e = roote.getElementsByAttributeValue("name","articleid");
            if(e.size() == 1){
                out.articleID = Long.parseLong(e.get(0).attr("value"));
            }
        }
        // pc
        /*
        Element e = document.getElementById("cafe_main");
        trace(document.toString());
        if(e != null){
            String pm = e.attr("src");
            pm = pm.substring(pm.indexOf("?")+1);
            String[] parts = pm.split("&");
            for(String p : parts){
                String[] fb = p.split("=");
                if(fb.length == 2 && fb[0].equalsIgnoreCase("clubid")){
                    out.cafeID = Long.parseLong(fb[1]);
                }
            }
        }
        Elements es = document.getElementsByClass("list-blog");
        if(es.size() > 0){
            for(Element _e : es){
                if(_e.hasClass("border-sub")){
                    out.articleID = Long.parseLong(_e.id().substring(_e.id().indexOf("_")+1));
                    break;
                }
            }
        }
        */
        // mobile? no support!
        if(out.cafeID == -1 || out.articleID == -1){
            traceE("URL " + id + " 파싱 실패!");
        }
        out.cafeCommentURL = id;
        return out;
    }
    public void saveConfig(Config c){
        Util.write(new File(getRootdir(),"config.json"),Util.getJsonPretty(
                g.toJson(c)
        ));
    }
    public ArrayList<Comment> getComments(Config cfg,long timeLimit_sec){
        ArrayList<Comment> out = new ArrayList<>();
        Document document = null;
        try {
            document = getCommentDOM(cfg);
        } catch (IOException e) {
            e.printStackTrace();
            return out;
        }
        if(document == null || document.title().contains("로그인")) {
            traceE("네이버 게시물을 전체 공개로 해주세요.");
            return out;
        }
        Elements comments = document.getElementsByClass("u_cbox_comment");
        for(int i = 0;i<comments.size();i+=1){
            Comment comment = new Comment();
            Elements es;
            Element roote = comments.get(i);
            Element e;
            if(roote.hasClass("re")){
                continue;
            }
            es = roote.getElementsByClass("u_cbox_info_main");
            if(es.size() == 1){
                es = es.get(0).getElementsByTag("a");
                if(es.size() == 1){
                    String id = es.get(0).attr("href");
                    id = id.substring(id.lastIndexOf("=")+1);
                    comment.userID = id;
                    comment.nickname = es.get(0).text();
                }
            }
            es = roote.getElementsByClass("u_cbox_contents");
            if(es.size() == 1){
                comment.content = es.get(0).text();
            }
            es = roote.getElementsByClass("u_cbox_date");
            if(es.size() == 1){
                String timestamp = es.get(0).text();
                ZoneId kr = ZoneId.of("Asia/Seoul");
                DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy.MM.dd. HH:mm");
                LocalDateTime localDateTime = LocalDateTime.parse(timestamp,fmt);
                ZonedDateTime timeInKR = ZonedDateTime.of(localDateTime,kr);
                comment.timestamp = timeInKR.toInstant();
            }
            if(comment.userID != null && comment.nickname != null && comment.content != null){
                if(timeLimit_sec <= 0 || comment.getTimeDelta() < timeLimit_sec){
                    out.add(comment);
                }
            }
        }
        trace(g.toJson(out));
        return out;
    }
    public Document getUrlDOM(String url) throws IOException {
        Connection connection = Jsoup.connect(url);
        connection.header("User-Agent","Mozilla/5.0 (Android 7.0; Mobile; rv:54.0) Gecko/54.0 Firefox/54.0");
        connection.header("Referer","https://m.cafe.naver.com/");
        connection.timeout(10000);
        //trace(doc.title());
        return connection.get();
    }
    public Document getCommentDOM(Config cfg) throws IOException {
        return getUrlDOM(cafeURL.replace("#cafeID",Long.toString(cfg.cafeID)).replace("#artiID",Long.toString(cfg.articleID)));
    }

    private void traceE(String s){
        System.err.println(s);
    }
    private void trace(String s){
        System.out.println(s);
    }
    private void exitFail(){
        System.out.println("Exiting");
        System.exit(-1);
    }

    private File getRootdir() {
        try{
            CodeSource codeSource = Main.class.getProtectionDomain().getCodeSource();
            File jarFile = new File(codeSource.getLocation().toURI().getPath());
            String jarDir = jarFile.getParentFile().getPath();
            return new File(jarDir);
        }catch (Exception e){
            return null;
        }
    }
}
