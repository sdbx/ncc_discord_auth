package net.tarks.craftingmod.nccauth.discord;

import net.dv8tion.jda.core.JDA;
import net.dv8tion.jda.core.entities.Game;
import net.dv8tion.jda.core.events.Event;
import net.dv8tion.jda.core.events.ReadyEvent;
import net.dv8tion.jda.core.hooks.EventListener;

public class InitListener implements EventListener {
    @Override
    public void onEvent(Event event) {
        JDA client = event.getJDA();
        if(event instanceof ReadyEvent){
            client.getPresence().setGame(Game.of(Game.GameType.DEFAULT,"Hello"));
        }
    }
}
