package net.tarks.craftingmod.nccauth.discord;

import net.dv8tion.jda.core.JDA;
import net.tarks.craftingmod.nccauth.Article;
import net.tarks.craftingmod.nccauth.Config;

import java.util.ArrayList;
import java.util.Collections;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class ArticleAlert implements Runnable {

    private final JDA client;
    private final Config cfg;
    private final ICommander cmd;
    private final ScheduledExecutorService service;

    private int lastID;

    public ArticleAlert(JDA client,ICommander command,Config cfg){
        this.client = client;
        this.cfg = cfg;
        this.cmd = command;
        this.service = Executors.newSingleThreadScheduledExecutor();
        this.lastID = -1;

    }
    public void enable(boolean e){
        if(e){
            service.scheduleWithFixedDelay(this,0,cfg.articleUpdateSec, TimeUnit.SECONDS);
        }else{
            service.shutdown();
        }
    }
    @Override
    public void run() {
        ArrayList<Article> articles = cmd.getNaverArticles(cfg.cafeID,5);
        if(lastID < 0){
            if(articles.size() >= 1){
                lastID = articles.get(0).id;
            }
        }else{
            Collections.reverse(articles);
            for(int i=0;i<articles.size();i+=1){
                Article ar = articles.get(i);
                if(ar.id <= lastID){
                    articles.remove(i);
                    i -= 1;
                }else{
                    lastID = ar.id;
                }
            }
            ArrayList<String> output = new ArrayList<>();
            for(Article ar : articles){
                StringBuilder prefix = new StringBuilder();
                StringBuilder suffix = new StringBuilder();
                if(ar.hasFile){
                    // 🗃
                    suffix.append(" \uD83D\uDDC3");
                }
                if(ar.hasVideo){
                    // ▶
                    suffix.append(" ▶");
                }
                if(ar.hasImage){
                    // 🖼
                    suffix.append(" \uD83D\uDDBC");
                }
                if(ar.hasVote){
                    // 🏁
                    suffix.append("\uD83C\uDFC1");
                }
                if(ar.question){
                    // ❔❓
                    prefix.append("❓");
                }
                output.add(String.format("%s님이 새 글을 올렸습니다: %s%s%s\n%s",String.format("%s(%s)",ar.username,ar.userID),prefix.toString(),ar.title,suffix.toString(),ar.link));
            }
            for(String s : output){
                for(long id : cfg.discordArticleIDs){
                    client.getTextChannelById(id).sendMessage(s).queue();
                }
            }
        }
    }
}
