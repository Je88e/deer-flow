"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { urlOfArtifact } from "@/core/artifacts/utils";

import {
  buildAuditViewModel,
  parseResultsFile,
  pickAuditArtifacts,
} from "./parser";
import type { ScoutAuditHeader } from "./types";

async function loadArtifactText({
  filepath,
  threadId,
}: {
  filepath: string;
  threadId: string;
}) {
  const response = await fetch(urlOfArtifact({ filepath, threadId }));
  if (!response.ok) {
    throw new Error(`Failed to load artifact: ${filepath}`);
  }
  return response.text();
}

export function useScoutAudit({
  threadId,
  artifactPaths,
}: {
  threadId: string;
  artifactPaths: string[];
}) {
  const files = useMemo(
    () => pickAuditArtifacts(artifactPaths),
    [artifactPaths],
  );

  const query = useQuery({
    queryKey: ["scout-audit", threadId, files?.reportBaseName, artifactPaths],
    enabled: Boolean(threadId && files),
    queryFn: async () => {
      if (!files) {
        return null;
      }

      const [resultsContent, reportContent, sessionLogContent] =
        await Promise.all([
          loadArtifactText({ filepath: files.resultsPath, threadId }),
          loadArtifactText({ filepath: files.reportPath, threadId }),
          loadArtifactText({ filepath: files.sessionLogPath, threadId }),
        ]);

      return buildAuditViewModel({
        artifactPaths,
        resultsContent,
        reportContent,
        sessionLogContent,
      });
    },
  });

  return {
    ...query,
    files,
    hasArtifacts: files !== null,
  };
}

export function useScoutAuditHeader({
  threadId,
  artifactPaths,
}: {
  threadId: string;
  artifactPaths: string[];
}) {
  const files = useMemo(
    () => pickAuditArtifacts(artifactPaths),
    [artifactPaths],
  );

  const query = useQuery({
    queryKey: [
      "scout-audit-header",
      threadId,
      files?.reportBaseName,
      artifactPaths,
    ],
    enabled: Boolean(threadId && files),
    queryFn: async () => {
      if (!files) {
        return null;
      }

      const resultsContent = await loadArtifactText({
        filepath: files.resultsPath,
        threadId,
      });
      const results = parseResultsFile(resultsContent);

      const header: ScoutAuditHeader = {
        reportNo: results.reportNo,
        batchNo: results.batchNo,
        docType: results.docType,
        overallResult: results.overallResult,
        productName: results.productName,
        specification: results.specification,
        standardRef: results.standardRef,
        auditDate: results.auditDate,
      };

      return header;
    },
  });

  return {
    ...query,
    files,
    hasArtifacts: files !== null,
  };
}
