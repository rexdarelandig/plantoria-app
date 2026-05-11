"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { createLocation } from "@/lib/laravel";
import { Field } from "@/components/ui/field";
import { FieldLabel } from "@/components/ui/field";

export function AddLocationDialog() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const dialogActionsRef = useRef<{
    close: () => void;
    unmount: () => void;
  } | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setError(null);
    setSaving(false);
  }, []);

  async function handleSave() {
    if (!name.trim()) return;

    setError(null);
    setSaving(true);

    try {
      const created = await createLocation(token, {
        name: name.trim(),
        description: description.trim(),
      });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "locations",
      });
      toast.success(`"${created.name}" was added.`);
      dialogActionsRef.current?.close();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save location.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      actionsRef={dialogActionsRef}
      onOpenChange={(open) => {
        if (!open) resetForm();
      }}
    >
      <DialogTrigger render={<Button className="w-fit" />}>
        Add Location
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add location</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <Field>
            <FieldLabel htmlFor="location-name">
              Location name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="location-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              className="h-9"
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="location-description">Description</Label>
              <Textarea
                id="location-description"
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
                placeholder="Care notes, location, or other details"
                rows={4}
              />
            </div>
          </Field>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={saving || !name.trim()}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save location"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
