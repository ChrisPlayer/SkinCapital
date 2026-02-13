import { Button } from '../../components/ui/button.tsx';
import { api } from '../../lib/api-client.ts';
import { Download } from 'lucide-react';

interface ExportButtonProps {
  steamId: string;
}

export function ExportButton({ steamId }: ExportButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10"
      title="Exporter CSV"
      asChild
    >
      <a href={api.export.csvUrl(steamId)} download>
        <Download className="w-5 h-5 text-gray-400" />
      </a>
    </Button>
  );
}
