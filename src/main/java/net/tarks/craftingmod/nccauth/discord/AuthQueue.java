package net.tarks.craftingmod.nccauth.discord;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.events.ReadyEvent;
import net.dv8tion.jda.core.hooks.ListenerAdapter;
import net.tarks.craftingmod.nccauth.Comment;
import net.tarks.craftingmod.nccauth.Config;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.*;

public abstract class AuthQueue extends ListenerAdapter implements Runnable {
    public static long limit_minute = 10;
    protected final ICommander cmd;
    protected Config cfg;
    protected final Gson g;

    protected final Object lock;

    private ArrayList<DiscordUser> queue;
    private HashMap<Long,Long> timelimit_sec;

    private ScheduledExecutorService service;
    public AuthQueue(Config c,ICommander cmd){
        this.cmd = cmd;
        this.cfg = c;

        g = new GsonBuilder().create();
        lock = new Object();

        queue = new ArrayList<>();
        timelimit_sec = new HashMap<>();
        //service = Executors.newScheduledThreadPool(2);
        service = Executors.newSingleThreadScheduledExecutor();

        final Runnable _this = this;
        //service.scheduleAtFixedRate(() -> service.execute(_this), 0, 10, TimeUnit.SECONDS);
        service.scheduleWithFixedDelay(this,0,10,TimeUnit.SECONDS);
    }

    protected int requestAuth(long discordUID,long saidChannel,String cafeName){
        DiscordUser u = new DiscordUser(discordUID,saidChannel);
        u.username = cafeName;
        return requestAuth(u);
    }
    protected int requestAuth(DiscordUser discordUser){
        synchronized (lock){
            if(timelimit_sec.containsKey(discordUser.userID)){
                return (int) Math.min((Instant.now().getEpochSecond()-timelimit_sec.get(discordUser.userID)),-1);
            }
            ArrayList<Integer> tokens = new ArrayList<>();
            for(DiscordUser du : queue){
                tokens.add(du.token);
            }
            int token;
            do {
                token = (int) Math.floor(Math.random() * 900000) + 100000;
            } while(tokens.contains(token));

            discordUser.token = token;
            Instant now = Instant.now();
            queue.add(discordUser);
            timelimit_sec.put(discordUser.userID,now.plus(limit_minute, ChronoUnit.MINUTES).getEpochSecond());
            return token;
        }
    }

    /**
     * Remove user from queue
     * @param discordUID
     */
    protected boolean editQueue(long discordUID,String newCafename){
        return editQueue(discordUID,newCafename,null);
    }
    protected boolean editQueue(long discordUID,String newCafename,String newCafeID){
        boolean result = false;
        synchronized (lock){
            for(DiscordUser user : queue){
                if(user.userID == discordUID){
                    if(newCafeID != null){
                        user.cafeID = newCafeID;
                    }
                    if(newCafename != null){
                        user.username = newCafename;
                    }
                    result = true;
                    break;
                }
            }
            return result;
        }
    }

    protected int getToken(long discordUID){
        for(DiscordUser u : queue){
            if(u.userID == discordUID){
                return u.token;
            }
        }
        return -1;
    }

    protected abstract void onAuthResult(ArrayList<DiscordUser> users);

    @Override
    public void run() {
        if(this.queue.size() <= 0) {
            return;
        }
        ArrayList<DiscordUser> changed = new ArrayList<>();
        // huge resource
        Instant now = Instant.now();

        // no need to synchronized : cmd;
        ArrayList<Comment> comments = cmd.getComments(cfg,60 * limit_minute); // waiting..

        synchronized (lock){
            for(int i=0;i<queue.size();i+=1){
                DiscordUser user = queue.get(i);
                if(now.getEpochSecond() >= timelimit_sec.get(user.userID)){
                    user.token = -1 * (int)limit_minute;
                    changed.add(user);
                    queue.remove(user);
                    timelimit_sec.remove(user.userID);
                    continue;
                }
                for(Comment c : comments){
                    if(c.content.startsWith(Integer.toString(user.token))){
                        if((user.cafeID != null && c.userID.equalsIgnoreCase(user.cafeID)) || (user.username != null && c.nickname.equals(user.username)) || (user.cafeID == null && user.username == null)){
                            user.cafeID = c.userID;
                            user.username = c.nickname;
                            changed.add(user);
                            queue.remove(user);
                            timelimit_sec.remove(user.userID);
                            break;
                        }
                    }
                }
            }
            if(changed.size() >= 1){
                onAuthResult(changed);
            }
        }
    }
    public interface onTokenListener {
        void onTokenGenerated(int token);
    }
}
