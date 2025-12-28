from test_utils import run_test

def test_amazon_baskets():
    # Scenario: looking for white' baskets on amazon
    run_test(
        "Amazon White Baskets",
        "looking for white baskets on amazon",
        page_context={"url": "about:blank", "title": "New Tab", "width": 1920, "height": 1080}
    )

if __name__ == "__main__":
    test_amazon_baskets()
