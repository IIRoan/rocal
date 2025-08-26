import React from "react";
import { CommandDialog, CommandList, CommandGroup, CommandItem, } from "@workspace/ui/components/navigation/command";
import { Key, ChevronRight, ArrowLeft, } from "lucide-react";
export function SecuritySettings({ open, onOpenChange, goBack, goForward, TransitionContainer, transitionDirection, }) {
    return (<CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction={transitionDirection}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button onClick={() => goBack("main")} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground"/>
          </button>
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Authentication">
            <CommandItem onSelect={() => goForward("passkeys")} className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30">
              <Key className="mr-3 h-4 w-4 text-muted-foreground"/>
              <div className="flex flex-col">
                <span className="text-foreground">Passkeys</span>
                <span className="text-xs text-muted-foreground">
                  Manage passwordless authentication
                </span>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60"/>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>);
}
