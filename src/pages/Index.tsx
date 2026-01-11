import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, ChefHat } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      {/* Logo and Title */}
      <div className="mb-12 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
          Prep Master
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Kitchen Prep Management System
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          The Country Club at Old Hawthorne
        </p>
      </div>

      {/* Entry Buttons */}
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Admin Button */}
        <Button
          onClick={() => navigate("/admin/login")}
          variant="outline"
          className="touch-target flex h-24 flex-col items-center justify-center gap-2 border-2 border-primary/50 bg-card text-xl font-semibold transition-all hover:border-primary hover:bg-primary/10"
        >
          <Shield className="h-8 w-8 text-primary" />
          <span>Admin</span>
        </Button>

        {/* Staff Button */}
        <Button
          onClick={() => navigate("/prep")}
          className="touch-target flex h-24 flex-col items-center justify-center gap-2 bg-primary text-xl font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          <ChefHat className="h-8 w-8" />
          <span>Staff</span>
        </Button>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-muted-foreground/50">
        Tap to enter
      </p>
    </div>
  );
};

export default Index;
