#!/usr/bin/env python3
"""Builds the iOS Shortcut "Projeto K Saúde" (reads today's Health data and POSTs it to the
Apps Script) and signs it with macOS `shortcuts sign` so the iPhone can import it.

The Apps Script URL and token are NOT in the file: the iPhone asks for them on import.
Run: python3 tools/make_shortcut.py  ->  shortcuts/Projeto-K-Saude.shortcut
"""
import os
import plistlib
import subprocess
import tempfile
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "shortcuts", "Projeto-K-Saude.shortcut")
OBJ = "￼"  # placeholder character used by Shortcuts for inline variables


def uid():
    return str(uuid.uuid4()).upper()


def ref(output_uuid, name):
    return {"OutputUUID": output_uuid, "OutputName": name, "Type": "ActionOutput"}


def token_string(attachment=None, text=None):
    if attachment is None:
        return {"Value": {"string": text}, "WFSerializationType": "WFTextTokenString"}
    return {"Value": {"string": OBJ, "attachmentsByRange": {"{0, 1}": attachment}}, "WFSerializationType": "WFTextTokenString"}


def token_attachment(attachment):
    return {"Value": attachment, "WFSerializationType": "WFTextTokenAttachment"}


def action(identifier, **params):
    return {"WFWorkflowActionIdentifier": f"is.workflow.actions.{identifier}", "WFWorkflowActionParameters": params}


def find_health_today(sample_type, u):
    # Shape observed in iOS exports: locked "Type is <picker label>" row + "Start Date is today" (1002).
    return action("filter.health.quantity", UUID=u, WFContentItemFilter={
        "Value": {
            "WFActionParameterFilterPrefix": 1,
            "WFContentPredicateBoundedDate": False,
            "WFActionParameterFilterTemplates": [
                {"Bounded": True, "Operator": 4, "Property": "Type", "Removable": False,
                 "Values": {"Enumeration": {"Value": sample_type, "WFSerializationType": "WFStringSubstitutableState"}}},
                {"Bounded": True, "Operator": 1002, "Property": "Start Date", "Removable": False,
                 "Values": {"Number": "7", "Unit": 16}},
            ],
        },
        "WFSerializationType": "WFContentPredicateTableTemplate",
    })


def statistics(operation, source_uuid, u):
    return action("statistics", UUID=u, WFStatisticsOperation=operation,
                  WFInput=token_attachment(ref(source_uuid, "Health Samples")))


def json_item(key, value, item_type=0):
    # item_type: 0 = text, 3 = number (sent as a JSON number, not a localized string)
    return {"WFItemType": item_type, "WFKey": token_string(text=key), "WFValue": value}


def build():
    u_url, u_token, u_date = uid(), uid(), uid()
    samples = [  # (Find Health Samples picker label, statistics, JSON key)
        ("Steps", "Sum", "steps"),
        ("Active Calories", "Sum", "active_kcal"),
        ("Heart Rate", "Average", "avg_hr"),
        ("Resting Heart Rate", "Average", "resting_hr"),
    ]
    actions = [
        action("gettext", UUID=u_url, WFTextActionText="https://script.google.com/macros/s/COLE-AQUI/exec"),
        action("gettext", UUID=u_token, WFTextActionText="COLE-O-TOKEN"),
        action("format.date", UUID=u_date, WFDateFormatStyle="Custom", WFDateFormat="Custom",
               WFDateFormatString="yyyy-MM-dd", WFDate=token_string({"Type": "CurrentDate"})),
    ]
    stats = {}
    for label, op, key in samples:
        u_find, u_stat = uid(), uid()
        actions.append(find_health_today(label, u_find))
        actions.append(statistics(op, u_find, u_stat))
        stats[key] = u_stat

    items = [
        json_item("action", token_string(text="health")),
        json_item("token", token_string(ref(u_token, "Text"))),
        json_item("date", token_string(ref(u_date, "Formatted Date"))),
        *[json_item(k, token_string(ref(u, "Statistics")), 3) for k, u in stats.items()],
        json_item("source", token_string(text="Zepp via Saúde (Atalho)")),
    ]
    actions.append(action(
        "downloadurl", UUID=uid(), WFURL=token_string(ref(u_url, "Text")), WFHTTPMethod="POST",
        WFHTTPBodyType="JSON", ShowHeaders=True,
        WFJSONValues={"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"},
    ))
    actions.append(action("notification", UUID=uid(), WFNotificationActionTitle="Projeto K",
                          WFNotificationActionBody="Dados do Saúde enviados para a planilha ✓",
                          WFNotificationActionSound=False))

    return {
        "WFWorkflowName": "Projeto K Saúde",
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2700.0.4",
        "WFWorkflowClientRelease": "26A0000a",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 61440, "WFWorkflowIconStartColor": 4282601983},
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFWorkflowImportQuestions": [
            {"ActionIndex": 0, "Category": "Parameter", "ParameterKey": "WFTextActionText",
             "DefaultValue": "https://script.google.com/macros/s/COLE-AQUI/exec",
             "Text": "Cole a URL do Apps Script (a que termina em /exec)"},
            {"ActionIndex": 1, "Category": "Parameter", "ParameterKey": "WFTextActionText",
             "DefaultValue": "", "Text": "Cole o token secreto (o mesmo dos Ajustes do app)"},
        ],
    }


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        unsigned = os.path.join(tmp, "unsigned.shortcut")
        with open(unsigned, "wb") as f:
            plistlib.dump(build(), f, fmt=plistlib.FMT_BINARY)
        subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", OUT], check=True)
    print(f"signed shortcut: {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
