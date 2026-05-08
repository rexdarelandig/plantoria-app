"use client";

import { useQuery } from "@tanstack/react-query";
import { GridIcon, ListIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { getPlants } from "@/lib/laravel";

export default function PlantsPage() {
  const { token, ready, user } = useAuth();

  const {
    data: plants = [],
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["plants", token],
    queryFn: ({ signal }) => getPlants(token, { signal }),
    enabled: ready && user !== null,
  });

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
      <Dialog>
        <DialogTrigger render={<Button className="w-fit" />}>
          Add Plant
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add plant</DialogTitle>
            <DialogDescription>
              Add details for a new plant.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Tabs defaultValue="grid" className="w-full">
        <TabsList variant="line" className="ml-auto">
          <TabsTrigger value="grid">
            <GridIcon /> Grid View
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon /> List View
          </TabsTrigger>
        </TabsList>
        <TabsContent value="grid">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : plants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plants yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plants.map((plant) => (
                <Card key={plant.id}>
                  <CardHeader>
                    <CardTitle>{plant.name}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="list">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : plants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plants yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scientific name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plants.map((plant) => (
                  <TableRow key={plant.id}>
                    <TableCell className="max-w-[140px] font-medium truncate">
                      {plant.name}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">
                      {plant.scientific_name}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-muted-foreground">
                      {plant.slug}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground md:table-cell">
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
