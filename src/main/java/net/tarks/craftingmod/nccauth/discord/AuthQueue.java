package net.tarks.craftingmod.nccauth.discord;

import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.hooks.ListenerAdapter;
import net.tarks.craftingmod.nccauth.Comment;
import net.tarks.craftingmod.nccauth.Config;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public abstract class AuthQueue extends ListenerAdapter implements Runnable {
    public static long limit_minute = 10;
    protected ICommander cmd;
    protected Config cfg;

    private ArrayList<DiscordUser> queue;
    private HashMap<Long,Long> timelimit_sec;

    private ScheduledExecutorService service;
    public AuthQueue(Config c,ICommander cmd){
        this.cmd = cmd;
        this.cfg = c;

        queue = new ArrayList<>();
        timelimit_sec = new HashMap<>();
        service = Executors.newScheduledThreadPool(2);

        final Runnable _this = this;
        service.scheduleAtFixedRate(() -> service.execute(_this), 0, 10, TimeUnit.SECONDS);
    }

    protected int requestAuth(long discordUID,long saidChannel){
        return requestAuth(new DiscordUser(discordUID,saidChannel));
    }
    protected int requestAuth(DiscordUser discordUser){
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

    protected abstract void onAuthResult(ArrayList<DiscordUser> users);

    @Override
    public void run() {
        if(this.queue.size() <= 0) {
            return;
        }
        ArrayList<DiscordUser> changed = new ArrayList<>();
        // huge resource
        Instant now = Instant.now();

        ArrayList<Comment> comments = cmd.getComments(cfg,60 * limit_minute);
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
