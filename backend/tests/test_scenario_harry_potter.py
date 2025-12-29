from test_utils import run_test

def test_harry_potter_pdf():
    # Scenario: looking for harry potter book 1 pdf
    run_test(
        "Harry Potter PDF",
        "looking for harry potter book 1 pdf",
        page_context={"url": "about:blank", "title": "New Tab", "width": 1920, "height": 1080}
    )

if __name__ == "__main__":
    test_harry_potter_pdf()
