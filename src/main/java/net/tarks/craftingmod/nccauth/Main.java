package net.tarks.craftingmod.nccauth;


import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.IOException;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Main {
    private static final String cafeURL = "https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
    public static void main(String[] args){
        System.out.println("Hello World!");
        new Main();
    }

    private Gson g;
    private Main _this;
    public Main(){
        _this = this;
        g = new GsonBuilder().create();

        //Config cfg = new Config(26686242,7156);
        Config cfg = new Config(23370764,783788);

        getComments(cfg,18000); // 5 hours?
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
        trace("Comments Length(include reply): " + comments.size());
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
                    trace(g.toJson(comment));
                    out.add(comment);
                }
            }
        }
        return out;
    }
    public Document getCommentDOM(Config cfg) throws IOException {
        Connection connection = Jsoup.connect(cafeURL.replace("#cafeID",Integer.toString(cfg.cafeID)).replace("#artiID",Integer.toString(cfg.articleID)));
        connection.header("User-Agent","Mozilla/5.0 (Android 7.0; Mobile; rv:54.0) Gecko/54.0 Firefox/54.0");
        connection.header("Referer","https://m.cafe.naver.com/");
        connection.timeout(10000);
        try{
            Document doc = connection.get();
            //trace(doc.title());
            return doc;
        } catch (IOException e) {
            throw e;
        }
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
}
