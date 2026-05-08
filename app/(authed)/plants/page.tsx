"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  LeafIcon,
  ListIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { AddPlantDialog } from "@/components/add-plant-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlants, type PlantSortField } from "@/lib/laravel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

const selectClass =
  "h-9 w-full min-w-[8.5rem] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 md:w-auto dark:bg-input/30";

const SEARCH_DEBOUNCE_MS = 400;

export default function PlantsPage() {
  const { token, ready, user } = useAuth();

  const [sortKey, setSortKey] = useState<PlantSortField>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== searchDraft) {
          setPage(1);
        }
        return searchDraft;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const {
    data,
    isPending,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "plants",
      token,
      page,
      pageSize,
      sortKey,
      sortDir,
      debouncedSearch,
    ],
    queryFn: ({ signal }) =>
      getPlants(
        token,
        {
          page,
          perPage: pageSize,
          sort: sortKey,
          direction: sortDir,
          search: debouncedSearch.trim() || undefined,
        },
        { signal }
      ),
    enabled: ready && user !== null,
  });

  const plants = data?.plants ?? [];
  const meta = data?.meta ?? {
    currentPage: 1,
    lastPage: 1,
    perPage: pageSize,
    total: 0,
  };

  const totalPages = Math.max(1, meta.lastPage);
  const currentPage = Math.min(Math.max(1, meta.currentPage), totalPages);

  const showControls = ready && user !== null && !isError;
  const empty =
    !isPending && !isError && meta.total === 0;

  return (
    <main className="flex flex-1 flex-col gap-2 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Plants
      </h1>
      <p className="mb-6 text-muted-foreground">
        Manage your plants from this page.
      </p>
      {isError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : "Could not load plants."}
        </p>
      ) : null}
      <AddPlantDialog />
      <Tabs defaultValue="grid" className="w-full">
        <TabsList variant="line" className="ml-auto">
          <TabsTrigger value="grid">
            <GridIcon /> Grid View
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon /> List View
          </TabsTrigger>
        </TabsList>

        {showControls ? (
          <div className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
            <div className="flex flex-col gap-1.5 sm:max-w-md">
              <Label htmlFor="plant-search" className="text-xs">
                Search
              </Label>
              <Input
                id="plant-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Name, description, scientific name…"
                className="h-9"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Filters after you stop typing (~{SEARCH_DEBOUNCE_MS / 1000}s).
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sort-key" className="text-xs">
                    Sort by
                  </Label>
                  <select
                    id="sort-key"
                    className={selectClass}
                    value={sortKey}
                    onChange={(e) => {
                      setSortKey(e.target.value as PlantSortField);
                      setPage(1);
                    }}
                  >
                    <option value="created_at">Last created</option>
                    <option value="name">Name</option>
                    <option value="scientific_name">Scientific name</option>
                    <option value="updated_at">Last updated</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sort-dir" className="text-xs">
                    Order
                  </Label>
                  <select
                    id="sort-dir"
                    className={selectClass}
                    value={sortDir}
                    onChange={(e) => {
                      setSortDir(e.target.value as "asc" | "desc");
                      setPage(1);
                    }}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="page-size" className="text-xs">
                    Per page
                  </Label>
                  <select
                    id="page-size"
                    className={selectClass}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(
                        Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]
                      );
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Page {currentPage} of {totalPages}
                  <span className="text-muted-foreground/80">
                    {" "}
                    · {meta.total} plant
                    {meta.total !== 1 ? "s" : ""}
                  </span>
                  {isFetching ? (
                    <span className="text-muted-foreground/80"> · …</span>
                  ) : null}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={currentPage <= 1 || isPending}
                    onClick={() =>
                      setPage((p) => Math.max(1, p - 1))
                    }
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={currentPage >= totalPages || isPending}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <TabsContent value="grid">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : empty ? (
            <p className="text-sm text-muted-foreground">
              {debouncedSearch.trim()
                ? "No plants match your search."
                : "No plants yet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plants.map((plant) => (
                <Card
                  key={plant.id}
                  className="gap-0 overflow-hidden p-0"
                >
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    {plant.image_url ? (
                      <Image
                        src={plant.image_url}
                        alt={plant.name}
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full min-h-[9rem] items-center justify-center">
                        <LeafIcon
                          className="size-12 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>
                  <CardHeader className="px-4 pt-4">
                    <CardTitle>{plant.name}</CardTitle>
                    {plant.scientific_name ? (
                      <CardDescription className="text-pretty italic">
                        {plant.scientific_name}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  {plant.description ? (
                    <CardContent className="px-4 pb-4 pt-0">
                      <p className="line-clamp-4 text-pretty text-sm text-muted-foreground">
                        {plant.description}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="list">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : empty ? (
            <p className="text-sm text-muted-foreground">
              {debouncedSearch.trim()
                ? "No plants match your search."
                : "No plants yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <span className="sr-only">Image</span>
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Scientific name
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden md:table-cell">Slug</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plants.map((plant) => (
                  <TableRow key={plant.id}>
                    <TableCell className="w-16 p-2 align-middle">
                      <div className="relative size-12 overflow-hidden rounded-md bg-muted">
                        {plant.image_url ? (
                          <Image
                            src={plant.image_url}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="size-12 object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center">
                            <LeafIcon
                              className="size-5 text-muted-foreground"
                              aria-hidden
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[140px] font-medium">
                      <div className="truncate">{plant.name}</div>
                      {plant.scientific_name ? (
                        <div className="truncate text-xs font-normal italic text-muted-foreground sm:hidden">
                          {plant.scientific_name}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden max-w-[180px] whitespace-normal italic text-muted-foreground sm:table-cell">
                      <span className="line-clamp-2 text-pretty">
                        {plant.scientific_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[min(28rem,40vw)] whitespace-normal text-muted-foreground">
                      <p className="line-clamp-2 text-pretty text-sm">
                        {plant.description?.trim()
                          ? plant.description
                          : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden max-w-[120px] md:table-cell">
                      <span className="truncate text-muted-foreground">
                        {plant.slug || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right text-muted-foreground lg:table-cell">
                      {new Date(plant.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
