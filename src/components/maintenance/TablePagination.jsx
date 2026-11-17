import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function TablePagination({ page, totalPages, totalItems, pageSize, onPageChange }) {
  if (totalItems <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <span className="text-xs text-muted-foreground">
        {totalItems} registros · Página {page} de {totalPages}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="gap-1">
          <ChevronLeft className="h-3 w-3" /> Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="gap-1">
          Próxima <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}