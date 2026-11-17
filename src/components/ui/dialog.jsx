"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const CB_PROPS = ["transform", "filter", "perspective", "backdrop-filter", "contain", "will-change", "mask", "mask-image"];

function resetContainingBlock(el) {
  if (!el || !el.style) return;
  el.style.setProperty("transform", "none", "important");
  el.style.setProperty("filter", "none", "important");
  el.style.setProperty("perspective", "none", "important");
  el.style.setProperty("backdrop-filter", "none", "important");
  el.style.setProperty("contain", "none", "important");
  el.style.setProperty("will-change", "auto", "important");
  el.style.setProperty("mask", "none", "important");
  el.style.setProperty("mask-image", "none", "important");
}

function getDialogPortalContainer() {
  if (typeof document === "undefined") return undefined;
  const body = document.body;
  if (!body) return undefined;

  let container = document.getElementById("brazon-dialog-portal");
  let needsReset = false;

  if (!container) {
    container = document.createElement("div");
    container.id = "brazon-dialog-portal";
    needsReset = true;
  }

  // The container MUST live inside <body> (but outside #root) so that Radix can
  // find the dialog when it applies its modal behaviour. Outside <body>, Radix
  // cannot locate the dialog and marks the whole application as hidden.
  if (container.parentElement !== body) {
    body.appendChild(container);
    needsReset = true;
  }

  // Reset containing-block properties only when the container is created or
  // re-attached — never on every render (that forced a full document restyle).
  if (needsReset) {
    resetContainingBlock(document.documentElement);
    resetContainingBlock(body);
    Array.from(body.children).forEach(resetContainingBlock);
    resetContainingBlock(container);
  }

  return container;
}

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => {
  const setRef = React.useCallback((node) => {
    if (node) {
      node.style.setProperty("position", "fixed", "important");
      node.style.setProperty("top", "0", "important");
      node.style.setProperty("left", "0", "important");
      node.style.setProperty("right", "0", "important");
      node.style.setProperty("bottom", "0", "important");
      node.style.setProperty("width", "100vw", "important");
      node.style.setProperty("height", "100vh", "important");
      node.style.setProperty("z-index", "9999", "important");
    }
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  return (
    <DialogPrimitive.Overlay
      ref={setRef}
      className={cn(
        "bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props} />
  );
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, onInteractOutside, ...props }, ref) => (
  <DialogPortal container={getDialogPortalContainer()}>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onInteractOutside={(e) => { e.preventDefault(); onInteractOutside?.(e); }}
      className={cn(
        "fixed left-[50%] top-[50%] z-[10000] grid w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}>
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  getDialogPortalContainer,
}