"""Offline tests for Funko metadata retrieval; no requests to Funko.com."""
import unittest
from scripts.funko_retrieve import official_url, extract, product_score, SearchLinks, select_batch

class FunkoRetrieveTests(unittest.TestCase):
    def test_official_url(self):
        self.assertTrue(official_url("https://funko.com/pop-superman/12345.html"))
        self.assertFalse(official_url("https://funko.com.evil.test/pop-superman/12345.html"))
        self.assertFalse(official_url("http://funko.com/pop-superman/12345.html"))
        self.assertFalse(official_url("https://funko.com/search/?term=superman"))

    def test_jsonld_image(self):
        markup = '<script type="application/ld+json">{"@type":"Product","name":"Pop Superman","image":["https://funko.com/img/a.jpg"]}</script>'
        self.assertEqual(extract(markup, "https://funko.com/pop-superman/12345.html"), ["https://funko.com/img/a.jpg"])

    def test_graph_and_image_object(self):
        markup = '<script type="application/ld+json">{"@graph":[{"@type":"Product","image":{"url":"https://funko.com/img/a.jpg"}}]}</script>'
        self.assertEqual(extract(markup, "https://funko.com/pop-superman/12345.html"), ["https://funko.com/img/a.jpg"])

    def test_product_slug_matching(self):
        pop = {"name": "Superman", "variant": ""}
        self.assertEqual(product_score(pop, "https://funko.com/pop-superman/12345.html"), 1)
        self.assertEqual(product_score(pop, "https://funko.com/pop-batman/12345.html"), 0)

    def test_variant_mismatch_requires_review(self):
        pop = {"name": "Superman", "variant": "Chase"}
        self.assertEqual(product_score(pop, "https://funko.com/pop-superman/12345.html"), 0)

    def test_search_link_parser(self):
        parser = SearchLinks()
        parser.feed('<a href="/pop-superman/12345.html">Superman</a>')
        self.assertEqual(parser.links, ["/pop-superman/12345.html"])

    def test_small_batch_and_offset(self):
        rows = [{"id": str(i)} for i in range(30)]
        self.assertEqual([r["id"] for r in select_batch(rows, 10, 5)], ["10", "11", "12", "13", "14"])
        self.assertEqual(len(select_batch(rows, 0, 10)), 10)

    def test_invalid_batch(self):
        with self.assertRaises(ValueError):
            select_batch([1, 2], -1, 1)
        with self.assertRaises(ValueError):
            select_batch([1, 2], 0, 0)

    def test_no_images(self):
        self.assertEqual(extract("<html></html>", "https://funko.com/pop-superman/12345.html"), [])

if __name__ == "__main__":
    unittest.main()
