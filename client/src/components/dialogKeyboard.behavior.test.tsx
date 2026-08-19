// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

function DismissibleDialogFixture() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>Ouvrir la fiche candidat</DialogTrigger>
      <DialogContent>
        <DialogTitle>Fiche candidat</DialogTitle>
        <DialogDescription>Contenu administratif sécurisé.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmationDialogFixture() {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger>Vérifier avant envoi</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Confirmer l’envoi</AlertDialogTitle>
        <AlertDialogDescription>Cette action nécessite une décision explicite.</AlertDialogDescription>
        <AlertDialogCancel>Revenir à la modification</AlertDialogCancel>
        <AlertDialogAction>Confirmer l’envoi</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("comportement clavier des dialogues partagés", () => {
  it("ferme un dialogue administratif par Échap et rend le focus à son déclencheur", async () => {
    const user = userEvent.setup();
    render(<DismissibleDialogFixture />);
    const trigger = screen.getByRole("button", { name: "Ouvrir la fiche candidat" });

    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("active l’annulation d’une confirmation par le clavier et rend le focus à son déclencheur", async () => {
    const user = userEvent.setup();
    render(<ConfirmationDialogFixture />);
    const trigger = screen.getByRole("button", { name: "Vérifier avant envoi" });

    await user.click(trigger);
    const cancel = screen.getByRole("button", { name: "Revenir à la modification" });
    cancel.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
