package net.tarks.craftingmod.nccauth.discord;

import net.dv8tion.jda.core.AccountType;
import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.JDABuilder;
import net.dv8tion.jda.core.entities.*;
import net.dv8tion.jda.core.events.guild.member.GuildMemberNickChangeEvent;
import net.dv8tion.jda.core.events.message.MessageReceivedEvent;
import net.dv8tion.jda.core.exceptions.RateLimitedException;
import net.dv8tion.jda.core.hooks.EventListener;
import net.dv8tion.jda.core.hooks.ListenerAdapter;
import net.tarks.craftingmod.nccauth.Config;

import javax.security.auth.login.LoginException;
import java.util.ArrayList;

public class DiscordPipe extends AuthQueue implements EventListener {
    protected JDA discordClient;

    public DiscordPipe(Config c,ICommander cmd){
        super(c,cmd);
        try {
            discordClient = new JDABuilder(AccountType.BOT).setToken(cfg.discordToken).buildBlocking();
        } catch (LoginException | InterruptedException e) {
            e.printStackTrace();
        }
        if(discordClient == null){
            System.err.println("Login fail.");
            return;
        }
        discordClient.addEventListener(this);
        discordClient.addEventListener(new InitListener());
        //discordClient.getGuildById(152746825806381056L).getTextChannelById(236873884283043842L).sendMessage("앙뇽");
    }

    /**
     * Event on auth success or fail(token = -1)
     * @param users
     */
    @Override
    protected void onAuthResult(ArrayList<DiscordUser> users) {
        for(DiscordUser user : users){
            if(user.token >= 0){
                TextChannel channel = discordClient.getTextChannelById(user.saidChannelID);
                if(channel.canTalk()){
                    channel.sendMessage("<@!#discordid>님(#cafeid)의 인증이 완료되었습니다."
                            .replace("#discordid",Long.toString(user.userID)).replace("#cafeid",user.cafeID)).queue();
                }
            }
        }
    }

    @Override
    public void onGuildMemberNickChange(GuildMemberNickChangeEvent event) {
        // nickname change
        discordClient.getTextChannelById(cfg.discordBotChID).sendMessage(String.format("닉네임 변경: %s -> %s",event.getPrevNick(),event.getNewNick())).queue();
    }

    @Override
    public void onMessageReceived(MessageReceivedEvent event) {
        if(event.getMessage().isFromType(ChannelType.TEXT)){
            User sender = event.getAuthor();
            String content = event.getMessage().getContentRaw();
            if(content.startsWith("/auth")){
                if(!event.isFromType(ChannelType.PRIVATE)){
                    if(event.getGuild().getIdLong() == cfg.discordRoomID){
                        // receive auth command
                        String[] split = content.split(" ");
                        DiscordUser user = new DiscordUser(sender.getIdLong(),event.getChannel().getIdLong());
                        if(split.length >= 2){
                            if(split.length == 2 && split[1].matches("^[a-zA-Z0-9]*$")){
                                user.cafeID = split[1];
                            }else{
                                user.username = content.substring(content.indexOf(" ")+1);
                                if(user.username.length() < 1){
                                    user.username = null;
                                }
                            }
                        }
                        try {
                            PrivateChannel pChannel = sender.openPrivateChannel().complete(true);
                            int auth = this.requestAuth(user);
                            pChannel.sendMessage("<@!#discordid>님 회원임을 인증하기 위하여 10분안에 #url 에 #num 숫자를 댓글에 남겨주세요. :)\n"
                            .replace("#discordid",Long.toString(sender.getIdLong()))
                            .replace("#url",cfg.cafeCommentURL)
                            .replace("#num",Integer.toString(auth))).queue();
                        } catch (RateLimitedException e) {
                            e.printStackTrace();
                        }
                    }
                }
            }
        }

        if (event.isFromType(ChannelType.PRIVATE))
        {
            System.out.printf("[PM] %s: %s\n", event.getAuthor().getName(),
                    event.getMessage().getContentDisplay());
        } else {
            System.out.printf("[%s][%s] %s: %s\n", event.getGuild().getName(),
                    event.getTextChannel().getName(), event.getMember().getEffectiveName(),
                    event.getMessage().getContentDisplay());
            if(event.getMessage().getContentDisplay().startsWith("^test")){

            }
        }
    }
}
