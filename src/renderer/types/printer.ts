// What GET /printers returns. The telemetry columns (status, last_print, jobs_*) were
// removed from the database, so they are deliberately not declared here: the admin
// fills them live through the socket, and this app does not receive them.
export interface Printer {
  id: number;
  name: string;
  address: string;
  activated: boolean;
  // The API accepts more values than the admin's type declares; not narrowed on purpose.
  station: string | null;
  paper_width: number;
  copies: number;
}
