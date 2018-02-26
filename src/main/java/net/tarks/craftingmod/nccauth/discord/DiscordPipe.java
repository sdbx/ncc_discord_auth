package net.tarks.craftingmod.nccauth.discord;

import net.dv8tion.jda.core.AccountType;
import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.JDABuilder;
import net.tarks.craftingmod.nccauth.Config;

import javax.security.auth.login.LoginException;

public class DiscordPipe extends MessageListener {
    private Config cfg;
    public DiscordPipe(Config c){
        cfg = c;
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
    }

}
