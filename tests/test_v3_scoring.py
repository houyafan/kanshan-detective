import unittest

from server.v3 import FinalBody, score_final_decision


def evidence(evidence_id: str, suspect_ids: list[str], relation: str = "支持") -> dict:
    return {
        "id": evidence_id,
        "suspectIds": suspect_ids,
        "relation": relation,
    }


def decision(culprit: str, accomplice: str | None, evidence_ids: list[str], red_herring_id: str, reason: str) -> FinalBody:
    return FinalBody(
        decisionId="test-decision",
        culpritId=culprit,
        accompliceId=accomplice,
        evidenceIds=evidence_ids,
        redHerringId=red_herring_id,
        reason=reason,
    )


class V3ScoringV2Test(unittest.TestCase):
    def test_perfect_path_scores_100(self) -> None:
        body = decision(
            "PRESSURE",
            "COLD",
            ["E07", "E10"],
            "E01",
            "E07工作消息支持压力是主因，咖啡可能共同作用；E10对照夜也说明手机不能单独证明全部影响。",
        )
        result = score_final_decision(
            body,
            [evidence("E07", ["PRESSURE"]), evidence("E10", ["BLUE"], "削弱")],
            evidence("E01", ["BLUE"]),
        )

        self.assertEqual(result["gradingVersion"], "V2")
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["grade"], "S")
        self.assertNotIn("gradeHardConditions", result)
        self.assertEqual(
            [item["id"] for item in result["gradeReasons"]],
            ["completion", "reconstruction", "evidence", "misleading", "reasoning"],
        )
        self.assertEqual(sum(item["maxScore"] for item in result["gradeReasons"]), 100)

    def test_wrong_red_herring_can_still_receive_s(self) -> None:
        body = decision(
            "PRESSURE",
            "COLD",
            ["E07", "E08"],
            "E04",
            "工作消息与担忧备忘支持压力作为主因，咖啡可能共同作用，但研究不能单独证明个体因果。",
        )
        result = score_final_decision(
            body,
            [evidence("E07", ["PRESSURE"]), evidence("E08", ["PRESSURE"])],
            evidence("E04", ["COLD"]),
        )

        self.assertEqual(result["score"], 97)
        self.assertEqual(result["grade"], "S")

    def test_reasonable_alternative_reconstruction_receives_a(self) -> None:
        body = decision(
            "NOISE",
            "PRESSURE",
            ["E03", "E01"],
            "E07",
            "我认为夜间声音可能是主因，但当前记录还不足以形成唯一结论，需要继续复核。",
        )
        result = score_final_decision(
            body,
            [evidence("E03", ["COLD"]), evidence("E01", ["BLUE"])],
            evidence("E07", ["PRESSURE"]),
        )

        self.assertEqual(result["score"], 73)
        self.assertEqual(result["grade"], "A")
        self.assertEqual(result["gradeName"], "主要方向成立")

    def test_simple_single_factor_reconstruction_receives_b(self) -> None:
        body = decision(
            "BLUE",
            None,
            ["E02", "E09"],
            "E03",
            "我认为蓝光先生是主要原因，目前只是依据显眼线索完成了这次判断。",
        )
        result = score_final_decision(
            body,
            [evidence("E02", []), evidence("E09", [])],
            evidence("E03", ["COLD"]),
        )

        self.assertEqual(result["score"], 41)
        self.assertEqual(result["grade"], "B")
        self.assertEqual(result["gradeName"], "调查完成，仍待复核")


if __name__ == "__main__":
    unittest.main()
