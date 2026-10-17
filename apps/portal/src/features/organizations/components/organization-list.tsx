import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableWrap } from "@/components/ui/table-wrap";
import { ROUTES } from "@/configs/routes.config";
import type { Organization } from "@/services/trust/trust.model";
import { registerOrganization } from "../actions";
import { KIND_LABEL, STATUS_LABEL, statusTone } from "../constants";

export function OrganizationTable({ organizations }: { organizations: Organization[] }) {
  return (
    <TableWrap label="Your organizations">
      <table data-testid="organization-list">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Domain</th>
            <th scope="col">Regency</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((o) => (
            <tr key={o.organization_id}>
              <td>
                <Link href={ROUTES.organization(o.organization_id)}>{o.name}</Link>
              </td>
              <td>{KIND_LABEL[o.kind]}</td>
              <td>
                <code>{o.domain}</code>
              </td>
              <td>{o.region?.regency_name ?? "—"}</td>
              <td>
                <Badge tone={statusTone(o.status)} icon={false}>
                  {STATUS_LABEL[o.status]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** SCR-060: name, type, domain and regency; the TXT record to publish comes back on the next page. */
export function RegisterOrganizationForm() {
  return (
    <form action={registerOrganization} className="card form" data-testid="register-form">
      <label>
        Name
        <input name="name" required minLength={2} maxLength={200} />
      </label>
      <fieldset>
        <legend>Type</legend>
        <label>
          <input type="radio" name="kind" value="newsroom" defaultChecked /> Newsroom
        </label>
        <label>
          <input type="radio" name="kind" value="agency" /> Government agency
        </label>
      </fieldset>
      <label>
        Domain (one you control)
        <input name="domain" required placeholder="newsroom.example.org" autoComplete="off" />
      </label>
      <label>
        Regency
        <input name="regency" required maxLength={120} />
      </label>
      <Button>Register and get the TXT record</Button>
    </form>
  );
}
