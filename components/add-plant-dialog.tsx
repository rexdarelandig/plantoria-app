"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useRef, useState } from "react";
import { LeafIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { createPlant } from "@/lib/laravel";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { FieldLabel } from "@/components/ui/field";

export type TreflePlantSearchItem = {
  id: number;
  scientific_name?: string | null;
  common_name?: string | null;
  family_common_name?: string | null;
  image_url?: string | null;
  slug?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickImageUrl(item: Record<string, unknown>): string | null {
  if (typeof item.image_url === "string" && item.image_url) {
    return item.image_url;
  }
  const di = item.default_image;
  if (di && typeof di === "object") {
    const o = di as Record<string, unknown>;
    for (const key of ["medium_url", "small_url", "thumbnail", "regular_url"]) {
      const v = o[key];
      if (typeof v === "string" && v) return v;
    }
  }
  const img = item.image;
  if (img && typeof img === "object") {
    const o = img as Record<string, unknown>;
    if (typeof o.url === "string" && o.url) return o.url;
  }
  return null;
}

function normalizeSearchItems(data: unknown): TreflePlantSearchItem[] {
  if (!isRecord(data)) return [];
  const raw = data.data;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): TreflePlantSearchItem | null => {
      if (!isRecord(item) || typeof item.id !== "number") return null;
      return {
        id: item.id,
        scientific_name:
          typeof item.scientific_name === "string"
            ? item.scientific_name
            : null,
        common_name:
          typeof item.common_name === "string" ? item.common_name : null,
        family_common_name:
          typeof item.family_common_name === "string"
            ? item.family_common_name
            : null,
        image_url: pickImageUrl(item),
        slug: typeof item.slug === "string" ? item.slug : null,
      };
    })
    .filter((x): x is TreflePlantSearchItem => x !== null);
}

export function AddPlantDialog() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const dialogActionsRef = useRef<{
    close: () => void;
    unmount: () => void;
  } | null>(null);

  const [lookupQuery, setLookupQuery] = useState("");
  const [name, setName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<TreflePlantSearchItem | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TreflePlantSearchItem[]>([]);
  const [showNoMatches, setShowNoMatches] = useState(false);

  const resetForm = useCallback(() => {
    setLookupQuery("");
    setName("");
    setDescription("");
    setSelected(null);
    setResults([]);
    setShowNoMatches(false);
    setError(null);
    setSearchLoading(false);
    setSaving(false);
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = lookupQuery.trim();
    if (!q) return;

    setError(null);
    setResults([]);
    setShowNoMatches(false);
    setSelected(null);
    setName("");
    setDescription("");
    setSearchLoading(true);

    try {
      const res = await fetch(
        `/api/trefle/plants/search?q=${encodeURIComponent(q)}`,
      );
      const body: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          isRecord(body) && typeof body.error === "string"
            ? body.error
            : isRecord(body) && typeof body.message === "string"
              ? body.message
              : "Lookup failed.";
        throw new Error(msg);
      }

      const items = normalizeSearchItems(body);
      setResults(items);
      setShowNoMatches(items.length === 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectResult(plant: TreflePlantSearchItem) {
    const displayName =
      plant.common_name?.trim() || plant.scientific_name?.trim() || "";
    setSelected(plant);
    setName(displayName);
    setDescription("");
    setError(null);
  }

  async function handleSave() {
    if (!selected || !name.trim()) return;

    setError(null);
    setSaving(true);

    try {
      await createPlant(token, {
        name: name.trim(),
        description: description.trim(),
        scientific_name: selected.scientific_name ?? undefined,
        image_url: selected.image_url ?? undefined,
        slug: selected.slug ?? undefined,
        trefle_id: selected.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["plants"] });
      dialogActionsRef.current?.close();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save plant.");
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
        Add Plant
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add plant</DialogTitle>
          <DialogDescription>
            Search by name using the{" "}
            <a
              href="https://trefle.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Trefle
            </a>{" "}
            plants API, pick a result, then save to your collection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-4">
          <Field orientation="horizontal">
            <Input
              id="plant-lookup"
              value={lookupQuery}
              onChange={(ev) => {
                const next = ev.target.value;
                setLookupQuery(next);
                if (!next.trim()) {
                  setResults([]);
                  setShowNoMatches(false);
                }
              }}
              placeholder="e.g. Monstera, snake plant"
              autoComplete="off"
              className="h-9"
            />
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="submit"
                    disabled={searchLoading || !lookupQuery.trim()}
                  />
                }
              >
                {searchLoading ? "Searching…" : "Look up on Trefle"}
              </PopoverTrigger>
              <PopoverContent>
                <PopoverHeader>
                  <PopoverTitle>Search Results</PopoverTitle>
                  {searchLoading ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Searching…
                      </span>
                    </div>
                  ) : null}
                  {results.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Results ({results.length}) — click one to continue
                      </span>
                      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                        {results.map((plant) => {
                          const title =
                            plant.common_name?.trim() ||
                            plant.scientific_name ||
                            "Unknown";
                          const subtitle = plant.common_name?.trim()
                            ? plant.scientific_name
                            : plant.family_common_name;
                          const isSelected = selected?.id === plant.id;

                          return (
                            <li key={plant.id} className="p-0">
                              <button
                                type="button"
                                onClick={() => selectResult(plant)}
                                className={cn(
                                  "flex w-full gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                                  isSelected && "bg-muted",
                                )}
                              >
                                {plant.image_url ? (
                                  <Image
                                    src={plant.image_url}
                                    alt={title}
                                    width={56}
                                    height={56}
                                    unoptimized
                                    className="size-14 shrink-0 rounded-md bg-muted object-cover"
                                  />
                                ) : (
                                  <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <LeafIcon
                                      className="size-6 text-muted-foreground"
                                      aria-hidden
                                    />
                                  </div>
                                )}
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span className="font-medium text-foreground">
                                    {title}
                                  </span>
                                  {subtitle ? (
                                    <span className="text-muted-foreground">
                                      {subtitle}
                                    </span>
                                  ) : null}
                                  {plant.slug ? (
                                    <span className="truncate text-xs text-muted-foreground">
                                      {plant.slug}
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {showNoMatches ? (
                    <p className="text-sm text-muted-foreground">
                      No plants matched that search on Trefle. Try another name.
                    </p>
                  ) : null}
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </Field>
        </form>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <Field>
            <FieldLabel htmlFor="plant-name">
              Plant name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="plant-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              className="h-9"
            />
            <FieldLabel htmlFor="plant-scientific-name">
              Scientific name
            </FieldLabel>
            <Input
              id="plant-scientific-name"
              value={scientificName}
              onChange={(ev) => setScientificName(ev.target.value)}
              className="h-9"
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="plant-description">Description</Label>
              <Textarea
                id="plant-description"
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
            {saving ? "Saving…" : "Save plant"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
