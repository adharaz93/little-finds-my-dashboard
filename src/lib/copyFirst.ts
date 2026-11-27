// Store actions that change a lot of data (reset, remove demo samples, import) copy everything to a
// backup key first. If that copy can't be saved they change nothing and report "backup-failed".
export type Force = { force?: boolean };
export type CopyFirst = "done" | "backup-failed";

type Confirm = (o: { message: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>;

// Runs such an action. On "backup-failed" the user is asked, and only on yes is the action run again
// without the copy. True when the action ran.
export async function runCopyFirst(
  confirm: Confirm,
  run: (o?: Force) => CopyFirst,
  anyway: { message: string; confirmLabel: string },
): Promise<boolean> {
  if (run() === "done") return true;
  if (!(await confirm({ ...anyway, danger: true }))) return false;
  run({ force: true });
  return true;
}
