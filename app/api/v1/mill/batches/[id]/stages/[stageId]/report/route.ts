import { requireShop } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { buildStageExecutionReportData } from '@/lib/server/stageReportService';
import { exportStageExecutionReportPDF } from '@/lib/pdf/stageExecutionReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx: any) => {
  const { shop } = await requireShop(req);
  const { id, stageId } = await ctx.params;

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json';

  const reportData = await buildStageExecutionReportData(shop.id, id, stageId);

  if (format === 'pdf') {
    const pdfBytes = await exportStageExecutionReportPDF(reportData);
    const filename = `Stage_Report_${reportData.batch.batchNumber}_${reportData.stage.stageName}.pdf`.replace(
      /[^a-zA-Z0-9_\.-]/g,
      '_'
    );

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return json(reportData);
});
