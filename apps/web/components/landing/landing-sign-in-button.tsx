import { ArrowRight } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";

interface LandingSignInButtonProps {
  onSignIn: () => void;
  isLeaving: boolean;
}

export function LandingSignInButton({
  onSignIn,
  isLeaving,
}: LandingSignInButtonProps) {
  return (
    <Button
      size="lg"
      className="relative h-10 min-h-10 max-h-10 rounded-lg py-0 after:absolute after:inset-x-0 after:-inset-y-0.5"
      onClick={onSignIn}
      disabled={isLeaving}
    >
      Sign in
      <ArrowRight aria-hidden data-icon="inline-end" />
    </Button>
  );
}
