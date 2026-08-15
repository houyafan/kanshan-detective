import unittest

from server.cli_adapter import _clean_answer_text


class CleanAnswerTextTest(unittest.TestCase):
    def test_removes_plain_recap_prefix(self):
        text = "根据你的要求，以下三句简短中文：\n第一句。\n第二句。"
        self.assertEqual(_clean_answer_text(text), "第一句。\n第二句。")

    def test_removes_bold_markdown_recap_prefix(self):
        text = "**根据你的要求，以下三句简短中文：**\n第一句。"
        self.assertEqual(_clean_answer_text(text), "第一句。")

    def test_leaves_other_answer_unchanged(self):
        text = "这是一段正常的知乎直答内容。"
        self.assertEqual(_clean_answer_text(text), text)


if __name__ == "__main__":
    unittest.main()
